// On-demand reachability check for the SRI webservices - not a continuous
// monitor (this project has no cron/polling infrastructure), just a proxy so
// the admin panel can ping gob.ec without hitting a browser CORS wall.
const SRI_ENDPOINTS = {
  'Recepción (pruebas)': 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
  'Autorización (pruebas)': 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  'Recepción (producción)': 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
  'Autorización (producción)': 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
};

async function pingEndpoint(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    return { reachable: response.ok, latencyMs: Date.now() - start };
  } catch (error) {
    return { reachable: false, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const entries = Object.entries(SRI_ENDPOINTS);
    const results = await Promise.all(entries.map(([, url]) => pingEndpoint(url)));
    const services = entries.map(([name], i) => ({ name, ...results[i] }));
    return res.status(200).json({ services, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error('SRI status check error:', error);
    return res.status(500).json({ error: 'No se pudo verificar el estado del SRI' });
  }
}
