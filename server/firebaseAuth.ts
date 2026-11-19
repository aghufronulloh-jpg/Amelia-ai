import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache | null = null;
let projectIdCache: string | null = null;

async function getFirebaseProjectId(): Promise<string> {
  if (projectIdCache) return projectIdCache;
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = await fs.readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as { projectId?: string };
  if (!parsed.projectId) {
    throw new Error('firebase-applet-config.json tidak memiliki projectId.');
  }
  projectIdCache = parsed.projectId;
  return parsed.projectId;
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAt) {
    return certCache.certs;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error('Gagal mengambil sertifikat verifikasi Firebase.');
  }
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/.exec(cacheControl);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600_000;
  const certs = (await res.json()) as Record<string, string>;
  certCache = {
    certs,
    expiresAt: Date.now() + maxAgeMs,
  };
  return certs;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Format token autentikasi tidak valid.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Header token tidak didukung.');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Kunci verifikasi token tidak ditemukan.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const isValid = verifier.verify(cert, Buffer.from(signatureB64, 'base64url'));
  if (!isValid) {
    throw new Error('Tanda tangan token tidak sah.');
  }

  const projectId = await getFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Audience token tidak sesuai proyek Firebase.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Issuer token tidak valid.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Subject UID tidak ditemukan pada token.');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Sesi login Firebase telah berakhir.');
  }

  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
  };
}
