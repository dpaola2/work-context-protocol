declare module "js-yaml" {
  function load(str: string): any;
  function dump(obj: any): string;
  export default { load, dump };
}
