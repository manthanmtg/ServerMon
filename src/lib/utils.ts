export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

export function formatBytes(bytes: number, system: 'binary' | 'decimal' = 'binary') {
    if (bytes === 0) return '0 B';
    const k = system === 'binary' ? 1024 : 1000;
    const sizes = system === 'binary' 
        ? ['B', 'KiB', 'MiB', 'GiB', 'TiB'] 
        : ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
