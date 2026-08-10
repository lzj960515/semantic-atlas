export interface GitRepository {
  readonly repositoryId: string;
  readonly worktreeRoot: string;
  readonly gitDirectory: string;
  readonly commonGitDirectory: string;
  readonly indexPath: string;
}
