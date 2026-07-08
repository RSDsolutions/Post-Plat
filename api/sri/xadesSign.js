import forge from 'node-forge';
import * as xadesjs from 'xadesjs';
import { Crypto } from '@peculiar/webcrypto';
import * as xmldom from '@xmldom/xmldom';
import xpath from 'xpath';

// The original hand-rolled signer (ported from open-factura) built the XAdES-BES
// signature and its digests by hand with plain string concatenation and ad-hoc
// whitespace collapsing instead of proper W3C Canonical XML (C14N). SRI's validator
// rejected it with "FIRMA INVALIDA (firma y/o certificados alterados)" - the digest
// values didn't match what a spec-compliant canonicalizer produces. xadesjs/xmldsigjs
// implements real C14N and WebCrypto-based signing, so we use that instead.

const cryptoEngine = new Crypto();
let engineReady = false;

function ensureEngine() {
  if (engineReady) return;
  xadesjs.Application.setEngine('NodeJS', cryptoEngine);
  xadesjs.setNodeDependencies({
    XMLSerializer: xmldom.XMLSerializer,
    DOMParser: xmldom.DOMParser,
    DOMImplementation: xmldom.DOMImplementation,
    xpath
  });
  engineReady = true;
}

function extractCertAndKey(p12Data, p12Password) {
  const arrayUint8 = new Uint8Array(p12Data);
  const base64 = forge.util.binary.base64.encode(arrayUint8);
  const der = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, p12Password);

  const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag] || [];
  if (certBag.length === 0) {
    throw new Error('El certificado .p12 no contiene ningún certificado');
  }
  // Some issuers (e.g. Banco Central) bundle a CA chain with multiple cert bags and
  // multiple key bags with distinguishing friendlyNames; prefer that when present,
  // but fall back to "only cert/key available" for simpler single-cert bundles.
  const friendlyName = certBag[1]?.attributes?.friendlyName?.[0] || certBag[0]?.attributes?.friendlyName?.[0] || '';

  // Pick the certificate with the most extensions (the actual signing cert tends to
  // carry more extensions than a bare root CA cert in the same bundle)
  const cert = certBag.reduce((prev, curr) => {
    const attributes = curr.cert.extensions;
    return attributes.length > prev.cert.extensions.length ? curr : prev;
  });

  const keyBags = pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  if (keyBags.length === 0) {
    throw new Error('No se encontró la clave privada en el certificado .p12');
  }

  let pkcs8;
  if (/BANCO CENTRAL/i.test(friendlyName)) {
    pkcs8 = keyBags.find((k) => /Signing Key/i.test(k.attributes?.friendlyName?.[0] || '')) || keyBags[0];
  } else {
    pkcs8 = keyBags[0];
  }

  const certificate = cert.cert;
  const now = new Date();
  if (now < certificate.validity.notBefore || now > certificate.validity.notAfter) {
    throw new Error('El certificado de firma electrónica está vencido o aún no es válido');
  }

  const key = pkcs8.key ?? pkcs8.asn1;
  return { certificate, key };
}

async function importPrivateKey(forgeKey) {
  const rsaPrivateKeyAsn1 = forge.pki.privateKeyToAsn1(forgeKey);
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(rsaPrivateKeyAsn1);
  const pkcs8Der = forge.asn1.toDer(pkcs8Asn1).getBytes();
  const pkcs8Buffer = Buffer.from(pkcs8Der, 'binary');

  return cryptoEngine.subtle.importKey(
    'pkcs8',
    pkcs8Buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
    false,
    ['sign']
  );
}

function certificateToBase64(certificate) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return Buffer.from(der, 'binary').toString('base64');
}

export async function signXml(p12Data, p12Password, xmlData) {
  ensureEngine();

  const { certificate, key } = extractCertAndKey(p12Data, p12Password);
  const privateKey = await importPrivateKey(key);
  const certBase64 = certificateToBase64(certificate);

  const doc = xadesjs.Parse(xmlData);

  const signedXml = new xadesjs.SignedXml();
  await signedXml.Sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    doc,
    {
      x509: [certBase64],
      signingCertificate: certBase64,
      references: [{ hash: 'SHA-1', transforms: ['enveloped'] }]
    }
  );

  return signedXml.toString();
}

// Basic sanity check for a certificate upload: confirms the file + password
// actually parse as a valid, currently-valid .p12, without doing any signing.
export function inspectCertificate(p12Data, p12Password) {
  const { certificate } = extractCertAndKey(p12Data, p12Password);
  const subject = {};
  certificate.subject.attributes.forEach((attr) => {
    if (attr.shortName) subject[attr.shortName] = attr.value;
  });
  return {
    commonName: subject.CN || null,
    notBefore: certificate.validity.notBefore,
    notAfter: certificate.validity.notAfter
  };
}
