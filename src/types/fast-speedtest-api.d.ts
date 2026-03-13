declare module 'fast-speedtest-api' {
  export interface Options {
    token: string;
    verbose?: boolean;
    timeout?: number;
    bufferSize?: number;
    unit?: string;
  }

  export default class FastSpeedtest {
    constructor(options: Options);
    getSpeed(): Promise<number>;
    static UNITS: {
      bps: string;
      Kbps: string;
      Mbps: string;
      GBps: string;
    };
  }
}
