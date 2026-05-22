export interface Job {
  readonly name: string;
  run(stagingDir: string): Promise<{ files: string[]; records: number }>;
}
