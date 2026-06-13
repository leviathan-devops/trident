// Type declarations for modules without types
declare module 'wink-eng-lite-web-model' {
  const model: object;
  export default model;
}

declare module 'wink-nlp' {
  interface TokenItem { pos(): string }
  interface SentenceItem { dependencyTree(): string; }
  interface WinkTokens {
    out(): unknown;
    out(cb: (t: TokenItem) => unknown): void;
  }
  interface WinkSentences {
    out(): unknown;
    out(cb: (s: SentenceItem) => unknown): void;
    length: number;
  }
  interface WinkEntities { out(): Array<{ type: string; value: string }>; }
  interface WinkDoc {
    tokens(): WinkTokens;
    sentences(): WinkSentences;
    entities(): WinkEntities;
  }
  interface WinkNLP { readDoc(text: string): WinkDoc; }
  function winkNLP(model: object): WinkNLP;
  export default winkNLP;
}

declare module 'sql.js' {
  export interface SqlJsStatement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }
  export interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
  }
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase;
  }
  function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
  export default initSqlJs;
}

declare module 'peggy' {
  interface Parser { parse(input: string): unknown; }
  function generate(grammar: string): Parser;
  export { generate };
}
