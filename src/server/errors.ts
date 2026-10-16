export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const notFound = () => new AppError(404, "NOT_FOUND", "Không tìm thấy ý tưởng này");
