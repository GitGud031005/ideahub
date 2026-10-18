import type { Author, Category, Comment } from "@/lib/domain";
export interface IdeaRecord {
  id: string; title: string; description: string; category: Category; tags: string[];
  creator: Author; createdAt: string; members: string[];
  memberJoinedAt?: Record<string, string>;
}
export interface DataState { version: 1; ideas: IdeaRecord[]; comments: Comment[] }
/** Operations must complete synchronously inside the transaction; no side effects or network I/O. */
export interface StateStore {
  read<T>(reader: (state: DataState) => T): Promise<T>;
  transact<T>(operation: (state: DataState) => T): Promise<T>;
}
