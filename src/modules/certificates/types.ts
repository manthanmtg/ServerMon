export interface CertificateInfo {
    domain: string;
    issuer: string;
    subject: string;
    validFrom: string;
    validTo: string;
    daysUntilExpiry: number;
    serialNumber: string;
    fingerprint: string;
    sans: string[];
    algorithm: string;
    keySize: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
    filePath: string;
    chainValid: boolean;
}

export interface CertbotCertificate {
    name: string;
    domains: string[];
    expiryDate: string;
    certPath: string;
    keyPath: string;
    chainPath: string;
    daysUntilExpiry: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
}

export interface CertbotTimer {
    enabled: boolean;
    lastRun: string;
    nextRun: string;
    active: boolean;
}

export interface CertificatesSnapshot {
    timestamp: string;
    source: 'live' | 'mock';
    certificates: CertbotCertificate[];
    certbotAvailable: boolean;
    certbotTimer: CertbotTimer | null;
    summary: {
        total: number;
        valid: number;
        expiringSoon: number;
        expired: number;
        nearestExpiry: number | null;
        nearestDomain: string | null;
    };
}
