import forge from 'node-forge';

// Ported from open-factura's signXml (dist/index.mjs). That library uses
// `import * as forge from "node-forge"`, which under native Node.js ESM/CJS
// interop leaves `forge.util`/`forge.pki`/etc. undefined (only `forge.default`
// is populated) - it only works when bundled (esbuild/webpack), not on Vercel's
// Node runtime. A plain default import (`import forge from 'node-forge'`) does
// not have that problem, so the signing logic is reproduced here with that fix.

function sha1Base64(text, encoding = 'utf8') {
  const md = forge.md.sha1.create();
  md.update(text, encoding);
  const hash = md.digest().toHex();
  return Buffer.from(hash, 'hex').toString('base64');
}

function hexToBase64(hex) {
  hex = hex.padStart(hex.length + (hex.length % 2), '0');
  const bytes = hex.match(/.{2}/g).map((byte) => parseInt(byte, 16));
  return Buffer.from(bytes).toString('base64');
}

function bigIntToBase64(bigInt) {
  const hex = bigInt.toString(16);
  const hexPairs = hex.match(/\w{2}/g);
  const bytes = hexPairs.map((pair) => parseInt(pair, 16));
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.match(/.{1,76}/g).join('\n');
}

function getRandomNumber(min = 990, max = 9999) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export async function signXml(p12Data, p12Password, xmlData) {
  let xml = xmlData;
  xml = xml.replace(/\s+/g, ' ');
  xml = xml.trim();
  xml = xml.replace(/(?<=\>)(\r?\n)|(\r?\n)(?=\<\/)/g, '');
  xml = xml.trim();
  xml = xml.replace(/(?<=\>)(\s*)/g, '');

  const arrayUint8 = new Uint8Array(p12Data);
  const base64 = forge.util.binary.base64.encode(arrayUint8);
  const der = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, p12Password);

  const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag];
  const friendlyName = certBag[1].attributes.friendlyName[0];

  let pkcs8;
  const cert = certBag.reduce((prev, curr) => {
    const attributes = curr.cert.extensions;
    return attributes.length > prev.cert.extensions.length ? curr : prev;
  });

  const issueAttributes = cert.cert.issuer.attributes;
  const issuerName = issueAttributes.reverse().map((attribute) => `${attribute.shortName}=${attribute.value}`).join(', ');

  if (/BANCO CENTRAL/i.test(friendlyName)) {
    const keys = pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag];
    for (let i = 0; i < keys.length; i++) {
      const name = keys[i].attributes.friendlyName[0];
      if (/Signing Key/i.test(name)) {
        pkcs8 = pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag][i];
      }
    }
  }
  if (/SECURITY DATA/i.test(friendlyName)) {
    pkcs8 = pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
  }
  if (!pkcs8) {
    // Fallback: most certificates only have a single signing key bag
    pkcs8 = pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  }
  if (!pkcs8) {
    throw new Error('No se encontró la clave privada en el certificado .p12');
  }

  const certificate = cert.cert;
  const notBefore = certificate.validity.notBefore;
  const notAfter = certificate.validity.notAfter;
  const now = new Date();
  if (now < notBefore || now > notAfter) {
    throw new Error('El certificado de firma electrónica está vencido o aún no es válido');
  }

  const key = pkcs8.key ?? pkcs8.asn1;

  let certificateX509 = forge.pki.certificateToPem(certificate);
  certificateX509 = certificateX509.substr(certificateX509.indexOf('\n'));
  certificateX509 = certificateX509.substr(0, certificateX509.indexOf('\n-----END CERTIFICATE-----'));
  certificateX509 = certificateX509.replace(/\r?\n|\r/g, '').replace(/([^\0]{76})/g, '$1\n');

  const certificateX509_asn1 = forge.pki.certificateToAsn1(certificate);
  const certificateX509_der = forge.asn1.toDer(certificateX509_asn1).getBytes();
  const hash_certificateX509_der = sha1Base64(certificateX509_der, 'utf8');
  const certificateX509_serialNumber = parseInt(certificate.serialNumber, 16);

  const exponent = hexToBase64(key.e.data[0].toString(16));
  const modulus = bigIntToBase64(key.n);

  xml = xml.replace(/\t|\r/g, '');
  const sha1_xml = sha1Base64(xml.replace('<?xml version="1.0" encoding="UTF-8"?>', ''), 'utf8');

  const nameSpaces = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"';
  const certificateNumber = getRandomNumber();
  const signatureNumber = getRandomNumber();
  const signedPropertiesNumber = getRandomNumber();
  const signedInfoNumber = getRandomNumber();
  const signedPropertiesIdNumber = getRandomNumber();
  const referenceIdNumber = getRandomNumber();
  const signatureValueNumber = getRandomNumber();
  const objectNumber = getRandomNumber();
  const isoDateTime = now.toISOString().slice(0, 19);

  let signedProperties = '';
  signedProperties += '<etsi:SignedProperties Id="Signature' + signatureNumber + '-SignedProperties' + signedPropertiesNumber + '">';
  signedProperties += '<etsi:SignedSignatureProperties>';
  signedProperties += '<etsi:SigningTime>';
  signedProperties += isoDateTime;
  signedProperties += '</etsi:SigningTime>';
  signedProperties += '<etsi:SigningCertificate>';
  signedProperties += '<etsi:Cert>';
  signedProperties += '<etsi:CertDigest>';
  signedProperties += '<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedProperties += '</ds:DigestMethod>';
  signedProperties += '<ds:DigestValue>';
  signedProperties += hash_certificateX509_der;
  signedProperties += '</ds:DigestValue>';
  signedProperties += '</etsi:CertDigest>';
  signedProperties += '<etsi:IssuerSerial>';
  signedProperties += '<ds:X509IssuerName>';
  signedProperties += issuerName;
  signedProperties += '</ds:X509IssuerName>';
  signedProperties += '<ds:X509SerialNumber>';
  signedProperties += certificateX509_serialNumber;
  signedProperties += '</ds:X509SerialNumber>';
  signedProperties += '</etsi:IssuerSerial>';
  signedProperties += '</etsi:Cert>';
  signedProperties += '</etsi:SigningCertificate>';
  signedProperties += '</etsi:SignedSignatureProperties>';
  signedProperties += '<etsi:SignedDataObjectProperties>';
  signedProperties += '<etsi:DataObjectFormat ObjectReference="#Reference-ID=' + referenceIdNumber + '">';
  signedProperties += '<etsi:Description>';
  signedProperties += 'contenido comprobante';
  signedProperties += '</etsi:Description>';
  signedProperties += '<etsi:MimeType>';
  signedProperties += 'text/xml';
  signedProperties += '</etsi:MimeType>';
  signedProperties += '</etsi:DataObjectFormat>';
  signedProperties += '</etsi:SignedDataObjectProperties>';
  signedProperties += '</etsi:SignedProperties>';

  const sha1SignedProperties = sha1Base64(
    signedProperties.replace('<ets:SignedProperties', '<etsi:SignedProperties ' + nameSpaces),
    'utf8'
  );

  let keyInfo = '';
  keyInfo += '<ds:KeyInfo Id="Certificate' + certificateNumber + '">';
  keyInfo += '\n<ds:X509Data>';
  keyInfo += '\n<ds:X509Certificate>\n';
  keyInfo += certificateX509;
  keyInfo += '\n</ds:X509Certificate>';
  keyInfo += '\n</ds:X509Data>';
  keyInfo += '\n<ds:KeyValue>';
  keyInfo += '\n<ds:RSAKeyValue>';
  keyInfo += '\n<ds:Modulus>\n';
  keyInfo += modulus;
  keyInfo += '\n</ds:Modulus>';
  keyInfo += '\n<ds:Exponent>\n';
  keyInfo += exponent;
  keyInfo += '\n</ds:Exponent>';
  keyInfo += '\n</ds:RSAKeyValue>';
  keyInfo += '\n</ds:KeyValue>';
  keyInfo += '\n</ds:KeyInfo>';

  const sha1KeyInfo = sha1Base64(keyInfo.replace('<ds:KeyInfo', '<ds:KeyInfo ' + nameSpaces), 'utf8');

  let signedInfo = '';
  signedInfo += '<ds:SignedInfo Id="Signature-SignedInfo' + signedInfoNumber + '">';
  signedInfo += '\n<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315">';
  signedInfo += '</ds:CanonicalizationMethod>';
  signedInfo += '\n<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1">';
  signedInfo += '</ds:SignatureMethod>';
  signedInfo += '\n<ds:Reference Id="SignedPropertiesID' + signedPropertiesIdNumber + '" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature' + signatureNumber + '-SignedProperties' + signedPropertiesNumber + '">';
  signedInfo += '\n<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedInfo += '</ds:DigestMethod>';
  signedInfo += '\n<ds:DigestValue>';
  signedInfo += sha1SignedProperties;
  signedInfo += '</ds:DigestValue>';
  signedInfo += '\n</ds:Reference>';
  signedInfo += '\n<ds:Reference URI="#Certificate' + certificateNumber + '">';
  signedInfo += '\n<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedInfo += '</ds:DigestMethod>';
  signedInfo += '\n<ds:DigestValue>';
  signedInfo += sha1KeyInfo;
  signedInfo += '</ds:DigestValue>';
  signedInfo += '\n</ds:Reference>';
  signedInfo += '\n<ds:Reference Id="Reference-ID' + referenceIdNumber + '" URI="#comprobante">';
  signedInfo += '\n<ds:Transforms>';
  signedInfo += '\n<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature">';
  signedInfo += '</ds:Transform>';
  signedInfo += '\n</ds:Transforms>';
  signedInfo += '\n<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedInfo += '</ds:DigestMethod>';
  signedInfo += '\n<ds:DigestValue>';
  signedInfo += sha1_xml;
  signedInfo += '</ds:DigestValue>';
  signedInfo += '\n</ds:Reference>';
  signedInfo += '\n</ds:SignedInfo>';

  const canonicalizedSignedInfo = signedInfo.replace('<ds:SignedInfo', '<ds:SignedInfo ' + nameSpaces);

  const md2 = forge.md.sha1.create();
  md2.update(canonicalizedSignedInfo, 'utf8');
  // key.sign() returns a forge binary string (raw bytes as char codes 0-255, not UTF-8 text) -
  // must decode as 'binary'/latin1, matching what the original btoa()-based implementation did
  const signature = Buffer.from(key.sign(md2).match(/.{1,76}/g).join('\n'), 'binary').toString('base64');

  let xadesBes = '';
  xadesBes += '<ds:Signature ' + nameSpaces + ' Id="Signature' + signatureNumber + '">';
  xadesBes += '\n' + signedInfo;
  xadesBes += '\n<ds:SignatureValue Id="SignatureValue' + signatureValueNumber + '">\n';
  xadesBes += signature;
  xadesBes += '\n</ds:SignatureValue>';
  xadesBes += '\n' + keyInfo;
  xadesBes += '\n<ds:Object Id="Signature' + signatureNumber + '-Object' + objectNumber + '">';
  xadesBes += '<etsi:QualifyingProperties Target="#Signature' + signatureNumber + '">';
  xadesBes += signedProperties;
  xadesBes += '</etsi:QualifyingProperties>';
  xadesBes += '</ds:Object>';
  xadesBes += '</ds:Signature>';

  return xml.replace(/(<[^<]+)$/, xadesBes + '$1');
}
