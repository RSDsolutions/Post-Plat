import forge from 'node-forge';
import { webcrypto } from 'node:crypto';

// The original hand-rolled signer (ported from open-factura) built the XAdES-BES
// signature and its digests by hand with plain string concatenation and ad-hoc
// whitespace collapsing instead of proper W3C Canonical XML (C14N). SRI's validator
// rejected it with "FIRMA INVALIDA (firma y/o certificados alterados)" - the digest
// values didn't match what a spec-compliant canonicalizer produces. xadesjs/xmldsigjs
// implements real C14N and WebCrypto-based signing, so we use that instead.
//
// Uses Node's built-in crypto.webcrypto instead of the @peculiar/webcrypto polyfill:
// that package's dual CJS/ESM "exports" map got mis-resolved by Vercel's bundler
// (loaded the ESM build via require(), crashing with "Cannot use import statement
// outside a module"). Node has shipped a spec-compliant crypto.webcrypto since v19,
// which sidesteps the whole package-resolution problem.
//
// xadesjs/@xmldom/xmldom/xpath are still loaded lazily (dynamic import) inside
// signXml() rather than as static top-level imports. A static import that fails to
// load/bundle on Vercel crashes the whole function before any try/catch can run
// (this bit us once already with open-factura's node-fetch); dynamic import lets a
// load failure surface as a normal catchable error with a readable message instead.

let xadesjsMod = null;

async function ensureEngine() {
  if (xadesjsMod) return;
  const [xadesjs, xmldom, xpathMod] = await Promise.all([
    import('xadesjs'),
    import('@xmldom/xmldom'),
    import('xpath')
  ]);

  xadesjs.Application.setEngine('NodeJS', webcrypto);
  xadesjs.setNodeDependencies({
    XMLSerializer: xmldom.XMLSerializer,
    DOMParser: xmldom.DOMParser,
    DOMImplementation: xmldom.DOMImplementation,
    xpath: xpathMod.default || xpathMod
  });
  xadesjsMod = xadesjs;
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

  return webcrypto.subtle.importKey(
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
  await ensureEngine();
  const xadesjs = xadesjsMod;

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
      // SRI's validator specifically checks that the "comprobante" node (the
      // factura root element's id="comprobante") is what's referenced by the
      // signature - an implicit empty-URI/whole-document Reference isn't
      // enough ("El nodo [comprobante] no se encuentra firmado")
      references: [{ uri: '#comprobante', hash: 'SHA-1', transforms: ['enveloped'] }]
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
