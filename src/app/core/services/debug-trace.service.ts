import { Injectable } from '@angular/core';

export type TraceLevel = 'INFO' | 'OK' | 'WARN' | 'ERR';

export interface TraceItem {
  ts: string;
  level: TraceLevel;
  tag: string;
  msg: string;
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class DebugTraceService {
  private items: TraceItem[] = [];

  add(level: TraceLevel, tag: string, msg: string, data?: any) {
    const ts = new Date().toISOString();
    const item: TraceItem = { ts, level, tag, msg, data };
    this.items.unshift(item); // lo más nuevo arriba
    this.items = this.items.slice(0, 80); // límite
  }

  clear() {
    this.items = [];
  }

  getAll() {
    return this.items;
  }
}
