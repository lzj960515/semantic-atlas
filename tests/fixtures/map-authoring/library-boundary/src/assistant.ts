import { Library, type Member } from "./library.js";
import { run, type Run } from "./execution.js";

export function answerQuestion(library: Library, member: Member, question: string): Run<string> {
  return run("answer", () => {
    const sources = library.search(member, question);
    return sources.length > 0 ? sources.join("\n") : "No matching reference material";
  });
}

export function sendDigest(send: (body: string) => string): Run<string> {
  return run("digest", () => send("Your daily digest"));
}
