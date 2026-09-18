import { Library, type Member } from "./library.js";

export function materialApi(library: Library, member: Member) {
  return {
    createNote: (id: string, text: string) => library.recordNote(member, id, text),
    upload: (id: string, file: string) => library.attachFile(member, id, file),
    revise: (id: string, file: string) => library.replaceFile(member, id, file),
    withdraw: (id: string) => library.withdraw(member, id),
    delete: (id: string) => library.remove(member, id),
    search: (term: string) => library.search(member, term),
  };
}

export function assistantTools(library: Library, member: Member) {
  return {
    saveReference: (id: string, text: string) => library.recordNote(member, id, text),
    findReference: (term: string) => library.search(member, term),
  };
}

// The authenticated transport has already verified the extraction provider.
export function extractionCallback(library: Library, id: string, job: string, text: string | null) {
  library.receiveExtraction(id, job, text);
}
