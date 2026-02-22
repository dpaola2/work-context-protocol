declare module "js-yaml" {
  function load(str: string): any;
  function dump(obj: any): string;
  export default { load, dump };
}

declare module "gray-matter" {
  interface GrayMatterFile {
    data: Record<string, any>;
    content: string;
  }
  function matter(input: string): GrayMatterFile;
  export default matter;
}
