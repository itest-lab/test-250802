import { auth } from './firebase';

async function withAuthHeaders(options = {}) {
  const token = await auth.currentUser.getIdToken();
  return {
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    ...options
  };
}

export async function createCase(data) {
  const opts = await withAuthHeaders({ method: 'POST', body: JSON.stringify(data) });
  const res = await fetch('/api/cases', opts);
  return res.json();
}

export async function addShipments(caseId, shipments) {
  const opts = await withAuthHeaders({ method: 'POST', body: JSON.stringify({ caseId, shipments }) });
  const res = await fetch('/api/shipments', opts);
  return res.json();
}

export async function trackStatus(carrier, trackingNo) {
  const opts = await withAuthHeaders({ method: 'POST', body: JSON.stringify({ carrier, trackingNo }) });
  const res = await fetch('/api/track', opts);
  return res.json();
}
