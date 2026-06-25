import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLIENTS_PATH = join(homedir(), 'time-tracker', 'google-ads', 'config', 'clients.json');

export function resolveCustomerId(input) {
  if (/^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/.test(input)) return input;

  if (existsSync(CLIENTS_PATH)) {
    const clients = JSON.parse(readFileSync(CLIENTS_PATH, 'utf-8'));
    for (const [key, c] of Object.entries(clients)) {
      if (key === input || c.name === input || (c.aliases || []).includes(input)) {
        return { customerId: c.customerId, name: c.name, key };
      }
    }
  }
  return null;
}
