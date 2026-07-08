import forge from 'node-forge';

// Parses a .p12/.pfx certificate client-side to validate the file + password
// combination before uploading, and to surface basic info (holder name, validity
// dates) so the store manager can confirm it's the right certificate.
export async function validateP12Certificate(file, password) {
  if (!file) throw new Error('Selecciona el archivo del certificado');
  if (!password) throw new Error('Ingresa la contraseña del certificado');

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = forge.util.binary.base64.encode(bytes);
  const der = forge.util.decode64(base64);

  let asn1;
  try {
    asn1 = forge.asn1.fromDer(der);
  } catch {
    throw new Error('El archivo no parece ser un certificado .p12/.pfx válido');
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch {
    throw new Error('Contraseña incorrecta o certificado corrupto');
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag] || [];
  if (certBag.length === 0) {
    throw new Error('El certificado no contiene ningún certificado X.509');
  }

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const hasKey = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || []).length > 0;
  if (!hasKey) {
    throw new Error('El certificado no contiene una clave privada (necesaria para firmar)');
  }

  const cert = certBag.reduce((prev, curr) => {
    return curr.cert.extensions.length > prev.cert.extensions.length ? curr : prev;
  }).cert;

  const now = new Date();
  if (now > cert.validity.notAfter) {
    throw new Error(`El certificado venció el ${cert.validity.notAfter.toLocaleDateString()}`);
  }
  if (now < cert.validity.notBefore) {
    throw new Error(`El certificado aún no es válido (inicia el ${cert.validity.notBefore.toLocaleDateString()})`);
  }

  const subject = {};
  cert.subject.attributes.forEach((attr) => {
    if (attr.shortName) subject[attr.shortName] = attr.value;
  });

  return {
    commonName: subject.CN || 'Desconocido',
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter
  };
}
