// Ported from open-factura's generateAccessKey/generateInvoice (dist/index.mjs).
// Their generateInvoice() computes the access key via `new Date(infoFactura.fechaEmision)`,
// re-parsing the dd/mm/yyyy string we're required to send SRI for XML display. JS's Date
// constructor interprets slash-separated dates as mm/dd/yyyy (US convention), silently
// transposing day and month whenever both are <= 12 - this produced a wrong access key
// that the SRI rejected ("ERROR EN LA ESTRUCTURA DE LA CLAVE DE ACCESO"). Building the
// access key here directly from a real Date object (never round-tripped through a
// dd/mm/yyyy string) avoids that entirely. The checksum algorithm itself is unchanged
// from open-factura's (confirmed correct by the SRI - it only rejected the date).

function formatDateToDDMMYYYY(date) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${String(day).padStart(2, '0')}${String(month).padStart(2, '0')}${year}`;
}

function generateRandomEightDigitNumber() {
  const min = 1e7;
  const max = 99999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateVerificatorDigit(accessKey) {
  let addition = 0;
  let multiple = 7;
  for (let i = 0; i < accessKey.length; i++) {
    addition += parseInt(accessKey.charAt(i), 10) * multiple;
    multiple = multiple > 2 ? multiple - 1 : 7;
  }
  let result = 11 - (addition % 11);
  if (result === 10) result = 1;
  if (result === 11) result = 0;
  return result;
}

export function generateAccessKey({ date, codDoc, ruc, environment, establishment, emissionPoint, sequential }) {
  let accessKey = '';
  accessKey += formatDateToDDMMYYYY(date);
  accessKey += codDoc;
  accessKey += ruc;
  accessKey += environment;
  accessKey += establishment;
  accessKey += emissionPoint;
  accessKey += sequential;
  accessKey += generateRandomEightDigitNumber();
  accessKey += '1';
  accessKey += generateVerificatorDigit(accessKey);
  return accessKey;
}
