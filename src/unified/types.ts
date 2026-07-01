export interface UnifiedFunctionRef {
  id: string;
  name: string;
  path: string;
}

export interface UnifiedSpecLinkRef {
  clauseHeading: string;
  clauseFile: string;
  confidence: number;
  ratified: boolean;
}

export interface UnifiedSpecView {
  key: string;
  source: 'praeforma' | 'anatomia-link';
  code: string | null;
  title: string;
  clauseFile: string | null;
  status?: string;
  priority?: string;
  targetDomains: string[];
  linkedDomains: string[];
  linkedFunctions: UnifiedFunctionRef[];
  implemented: boolean;
}

export interface UnifiedDomainView {
  domain: string;
  source: 'praeforma' | 'anatomia' | 'both';
  implementorCount: number;
  functions: UnifiedFunctionRef[];
  specLinks: UnifiedSpecLinkRef[];
  praeformaSpecs: Array<Pick<UnifiedSpecView, 'key' | 'code' | 'title' | 'status' | 'priority'>>;
  status: 'covered' | 'spec-only' | 'code-only' | 'anatomia-only';
}

export interface UnifiedView {
  project: string;
  pfProject: string | null;
  anatomiaProject: string;
  generatedAt: string;
  mode: 'anatomia-only' | 'integrated';
  warnings: string[];
  domains: UnifiedDomainView[];
  specs: UnifiedSpecView[];
  summary: {
    domains: number;
    specs: number;
    praeformaSpecs: number;
    anatomiaSpecClauses: number;
    coveredDomains: number;
    specOnlyDomains: number;
    codeOnlyDomains: number;
    linkedFunctions: number;
  };
}
