export type OperationManual = {
  title: string;
  introduction: string;
  chapters: {
    id: string;
    title: string;
    steps: string[];
    note?: string;
    figures?: { file: string; caption: string }[];
  }[];
};
