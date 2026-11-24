import type { BusinessNode, BusinessRelation } from "./map.js";
import type { ResolvedNavigationAnchor } from "./query-location.js";

/** 位置只在本次读取时派生，不写回业务资料。 */
export interface QueryMapReference {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
}

export interface QueryConcept extends Pick<
  BusinessNode,
  "id" | "kind" | "name" | "summary" | "notes"
> {
  readonly map: QueryMapReference;
  readonly anchors: readonly ResolvedNavigationAnchor[];
}

export interface QueryRelation extends Pick<
  BusinessRelation,
  "from" | "type" | "to" | "summary" | "notes"
> {
  readonly map: QueryMapReference;
}

export interface QueryFlowReference {
  readonly id: string;
  readonly name: string;
  readonly scenario: string;
  readonly map: QueryMapReference;
  readonly references: readonly {
    readonly concept: string;
    readonly step: string;
    readonly map: QueryMapReference;
  }[];
}

/** 显式关系及共享数据、接口、规则的其他使用方，不能证明未记录的影响。 */
export interface BusinessQuerySummary {
  readonly scope: "recorded";
  readonly concepts: readonly QueryConcept[];
  readonly relations: readonly QueryRelation[];
  readonly flows: readonly QueryFlowReference[];
}
