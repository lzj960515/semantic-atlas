export interface Material {
  id: string;
  workspace: string;
  revision: number;
  state: "processing" | "ready" | "failed" | "withdrawn";
  text: string;
  job?: string;
}

export interface Member {
  workspace: string;
  role: "owner" | "member";
}

export interface TextExtractor {
  submit(file: string): string;
}

export class Library {
  readonly materials = new Map<string, Material>();

  constructor(private readonly extractor: TextExtractor) {}

  recordNote(member: Member, id: string, text: string): Material {
    this.requireOwner(member);
    if (this.materials.has(id)) throw new Error("material already exists");
    const material: Material = {
      id,
      workspace: member.workspace,
      revision: 1,
      state: "ready",
      text,
    };
    this.materials.set(id, material);
    return material;
  }

  attachFile(member: Member, id: string, file: string): Material {
    const material = this.recordNote(member, id, "");
    material.state = "processing";
    material.job = this.extractor.submit(file);
    return material;
  }

  replaceFile(member: Member, id: string, file: string): void {
    this.requireOwner(member);
    const material = this.ownedMaterial(member, id);
    material.revision += 1;
    material.state = "processing";
    material.text = "";
    material.job = this.extractor.submit(file);
  }

  receiveExtraction(id: string, job: string, text: string | null): void {
    const material = this.materials.get(id);
    if (!material || material.job !== job || material.state !== "processing") return;
    material.state = text === null ? "failed" : "ready";
    material.text = text ?? "";
  }

  withdraw(member: Member, id: string): void {
    this.requireOwner(member);
    const material = this.ownedMaterial(member, id);
    material.state = "withdrawn";
    material.text = "";
  }

  remove(member: Member, id: string): void {
    this.requireOwner(member);
    this.ownedMaterial(member, id);
    this.materials.delete(id);
  }

  search(member: Member, term: string): string[] {
    return [...this.materials.values()]
      .filter((material) => material.workspace === member.workspace)
      .filter((material) => material.state === "ready" && material.text.includes(term))
      .map((material) => material.text);
  }

  private requireOwner(member: Member): void {
    if (member.role !== "owner") throw new Error("workspace owner required");
  }

  private ownedMaterial(member: Member, id: string): Material {
    const material = this.materials.get(id);
    if (!material || material.workspace !== member.workspace) throw new Error("not found");
    return material;
  }
}
