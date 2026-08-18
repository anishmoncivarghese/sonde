import type { SymbolRecord } from "../adapters/types.js";

export class SymbolTable {
  private readonly byShortName = new Map<string, SymbolRecord[]>();
  private readonly byFileAndQualifiedName = new Map<string, SymbolRecord[]>();
  private readonly fileBySymbol = new Map<SymbolRecord, string>();

  add(file: string, symbol: SymbolRecord): void {
    this.fileBySymbol.set(symbol, file);
    const named = this.byShortName.get(symbol.shortName) ?? [];
    named.push(symbol);
    this.byShortName.set(symbol.shortName, named);

    const qualifiedKey = `${file}|${symbol.qualifiedName}`;
    const qualified = this.byFileAndQualifiedName.get(qualifiedKey) ?? [];
    qualified.push(symbol);
    this.byFileAndQualifiedName.set(qualifiedKey, qualified);
  }

  candidates(name: string): SymbolRecord[] {
    return this.byShortName.get(name) ?? [];
  }

  candidatesInFile(file: string, name: string): SymbolRecord[] {
    return this.candidates(name).filter(
      (symbol) => this.fileBySymbol.get(symbol) === file,
    );
  }

  qualifiedInFile(file: string, qualifiedName: string): SymbolRecord | undefined {
    return this.byFileAndQualifiedName.get(`${file}|${qualifiedName}`)?.[0];
  }
}
