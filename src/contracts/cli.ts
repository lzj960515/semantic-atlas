import type {
  BusinessNode,
  BusinessRelation,
  MapIssue,
  RepositoryMapSource,
} from "./map.js";

export interface CliRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliSuccessEnvelope<TCommand extends string, TData> {
  readonly schemaVersion: 1;
  readonly ok: true;
  readonly command: TCommand;
  readonly repository: RepositoryMapSource;
  readonly data: TData;
}

export interface StandaloneCliSuccessEnvelope<TCommand extends string, TData> {
  readonly schemaVersion: 1;
  readonly ok: true;
  readonly command: TCommand;
  readonly data: TData;
}

export interface CliErrorEnvelope<TCommand extends string> {
  readonly schemaVersion: 1;
  readonly ok: false;
  readonly command: TCommand;
  readonly repository?: RepositoryMapSource;
  readonly error: CliError;
}

export type CliError =
  | {
      readonly code: "MAP_NOT_FOUND";
      readonly message: string;
    }
  | {
      readonly code: "MAP_DOCUMENT_INVALID";
      readonly message: string;
      readonly issues: readonly MapIssue[];
    }
  | {
      readonly code: "CONCEPT_NOT_FOUND";
      readonly message: string;
      readonly selector: string;
    }
  | {
      readonly code: "CONCEPT_AMBIGUOUS";
      readonly message: string;
      readonly selector: string;
      readonly candidates: readonly ConceptCandidate[];
    }
  | {
      readonly code: "REPOSITORY_INVALID";
      readonly message: string;
    }
  | {
      readonly code: "OUTPUT_FAILED";
      readonly message: string;
      readonly outputPath: string;
    }
  | {
      readonly code: "INVALID_COMMAND";
      readonly message: string;
    }
  | {
      readonly code: "INTERNAL_ERROR";
      readonly message: string;
    }
  | {
      readonly code: "MANAGED_SKILL_CONFLICT";
      readonly message: string;
      readonly directory: string;
    }
  | {
      readonly code: "SETUP_FAILED";
      readonly message: string;
    }
  | {
      readonly code: "UPGRADE_FAILED";
      readonly message: string;
      readonly step: "check" | "install" | "locate" | "verify" | "setup";
    };

export interface ValidateData {
  readonly documentCount: number;
  readonly nodeCount: number;
  readonly relationCount: number;
}

export type ConceptMatchKind = "id" | "name" | "alias" | "partial";

export interface ConceptCandidate {
  readonly id: string;
  readonly name: string;
  readonly kind: BusinessNode["kind"];
  readonly documentId: string;
}

export interface ContextRelation {
  readonly type: BusinessRelation["type"];
  readonly summary: string;
  readonly notes?: string;
  readonly documentId: string;
  readonly from: BusinessNode;
  readonly to: BusinessNode;
}

export interface ContextData {
  readonly selector: string;
  readonly matchedBy: ConceptMatchKind;
  readonly selected: BusinessNode;
  readonly ancestors: readonly BusinessNode[];
  readonly children: readonly BusinessNode[];
  readonly incoming: readonly ContextRelation[];
  readonly outgoing: readonly ContextRelation[];
}

export interface RenderData {
  readonly format: "html";
  readonly outputPath: string;
  readonly nodeCount: number;
  readonly relationCount: number;
}

export interface SetupData {
  readonly outcome: "installed" | "current" | "repaired" | "upgraded" | "recovered";
  readonly targetDirectory: string;
  readonly identity: {
    readonly packageName: string;
    readonly packageVersion: string;
    readonly skillName: "semantic-atlas";
    readonly fingerprint: string;
  };
}

export interface UpgradeData {
  readonly outcome: "current" | "upgraded";
  readonly previousVersion: string;
  readonly targetVersion: string;
  readonly skillDirectory: string;
}

export type ValidateEnvelope =
  | CliSuccessEnvelope<"validate", ValidateData>
  | CliErrorEnvelope<"validate">;

export type ContextEnvelope =
  | CliSuccessEnvelope<"context", ContextData>
  | CliErrorEnvelope<"context">;

export type RenderEnvelope =
  | CliSuccessEnvelope<"render", RenderData>
  | CliErrorEnvelope<"render">;

export type SetupEnvelope =
  | StandaloneCliSuccessEnvelope<"setup", SetupData>
  | CliErrorEnvelope<"setup">;

export type UpgradeEnvelope =
  | StandaloneCliSuccessEnvelope<"upgrade", UpgradeData>
  | CliErrorEnvelope<"upgrade">;
