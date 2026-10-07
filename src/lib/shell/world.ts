// The pretend network around the practice computer: which names exist, their addresses, and
// which of them are whole simulated computers you can log in to (Part 8 of the course). Each
// simulated computer has its own file system, mounted (root-only) in the practice computer at
// /srv/hosts/<name>, so a lesson's set-up can prepare it with ordinary commands.
import { HOST } from "./util";

/** A computer you can SSH into: a second Machine with its own files, users and services. */
export type SimHost = { name: string; fqdn: string; ip: string; aliases: string[] };

export const SIM_HOSTS: SimHost[] = [
  { name: "shop", fqdn: "shop.inkwell.example", ip: "203.0.113.20", aliases: ["inkwell.example", "www.inkwell.example", "downloads.inkwell.example"] },
  { name: "backup", fqdn: "backup.inkwell.example", ip: "203.0.113.30", aliases: [] },
];

export const HOSTS_ROOT = "/srv/hosts";

// This computer's own address on its network.
export const LOCAL_IP = "10.0.2.15";

/**
 * Everything else on the "internet". `ping: false` hosts don't answer ping (many don't);
 * `down: true` hosts never answer anything, so connections time out.
 */
export type NetHost = { name: string; ip: string; ping?: boolean; down?: boolean; cname?: string };

export const NET_HOSTS: NetHost[] = [
  { name: "github.com", ip: "140.82.121.4", ping: false },
  { name: "api.github.com", ip: "140.82.121.6", ping: false },
  { name: "raw.githubusercontent.com", ip: "185.199.108.133" },
  { name: "example.com", ip: "93.184.215.14" },
  { name: "www.example.com", ip: "93.184.215.14", cname: "example.com" },
  { name: "archive.ubuntu.com", ip: "91.189.91.82" },
  { name: "old-backup.inkwell.example", ip: "203.0.113.99", down: true },
  { name: "dns.google", ip: "8.8.8.8" },
];

export type Resolved = { name: string; ip: string; sim?: SimHost; local?: boolean; net?: NetHost };

/** Looks a name (or an address) up: /etc/hosts first, then the pretend DNS. */
export function resolveName(name: string, etcHosts: string): Resolved | undefined {
  const n = name.toLowerCase().replace(/\.$/, "");
  if (n === "localhost" || n === "127.0.0.1" || n === HOST || n === "127.0.1.1" || n === LOCAL_IP) return { name: n, ip: n === "localhost" ? "127.0.0.1" : n === HOST ? "127.0.1.1" : n, local: true };
  for (const line of etcHosts.split("\n")) {
    const parts = line.replace(/#.*/, "").trim().split(/\s+/);
    if (parts.length >= 2 && parts.slice(1).includes(n)) return byIp(parts[0], n);
  }
  const sim = SIM_HOSTS.find((h) => h.name === n || h.fqdn === n || h.aliases.includes(n) || h.ip === n);
  if (sim) return { name: n, ip: sim.ip, sim };
  const net = NET_HOSTS.find((h) => h.name === n || h.ip === n);
  if (net) return { name: n, ip: net.ip, net };
  // GitHub Pages sites: <owner>.github.io
  if (n.endsWith(".github.io")) return { name: n, ip: "185.199.108.153", net: { name: n, ip: "185.199.108.153" } };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(n)) return { name: n, ip: n, net: { name: n, ip: n, down: true } };
  return undefined;
}

function byIp(ip: string, name: string): Resolved {
  if (ip.startsWith("127.") || ip === LOCAL_IP) return { name, ip, local: true };
  const sim = SIM_HOSTS.find((h) => h.ip === ip);
  if (sim) return { name, ip, sim };
  const net = NET_HOSTS.find((h) => h.ip === ip);
  return { name, ip, net: net ?? { name, ip, down: true } };
}
