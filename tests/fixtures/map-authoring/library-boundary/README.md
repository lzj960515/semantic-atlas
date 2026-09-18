# Workspace Assistant

A small service where workspace members maintain reference material and ask an
assistant questions about it. Workspace owners can edit source material; members
can use ready material from their own workspace. File text extraction is
provided by a remote service. The repository also contains a scheduled digest
and a subscription renewal action.

`src/endpoints.ts` exposes the user/tool entry points. The source files are a
self-contained miniature of the service behavior; in-memory records stand in
for its database. The retained map was drawn during an earlier chat task.
