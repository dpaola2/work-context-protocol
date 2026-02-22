import * as fs from "fs";
import * as path from "path";

export interface RepoInfo {
  owner: string;
  repo: string;
  provider: "github" | "bitbucket" | "gitlab" | "azure";
}

const HOST_TO_PROVIDER: Record<string, RepoInfo["provider"]> = {
  "github.com": "github",
  "bitbucket.org": "bitbucket",
  "gitlab.com": "gitlab",
  "dev.azure.com": "azure",
  "ssh.dev.azure.com": "azure",
};

/**
 * Parse a git remote URL into owner, repo, and provider.
 * Handles SSH, HTTPS, and Azure DevOps formats.
 */
export function parseRemoteUrl(url: string): RepoInfo | null {
  // Azure DevOps HTTPS: https://dev.azure.com/{org}/{project}/_git/{repo}
  const azureHttps = url.match(
    /https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/.\s]+)/,
  );
  if (azureHttps) {
    return {
      owner: `${azureHttps[1]}/${azureHttps[2]}`,
      repo: azureHttps[3],
      provider: "azure",
    };
  }

  // Azure DevOps SSH: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  const azureSsh = url.match(
    /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/.\s]+)/,
  );
  if (azureSsh) {
    return {
      owner: `${azureSsh[1]}/${azureSsh[2]}`,
      repo: azureSsh[3],
      provider: "azure",
    };
  }

  // SSH: git@host:owner/repo.git
  const ssh = url.match(/git@([^:]+):([^/]+)\/([^/.\s]+?)(?:\.git)?$/);
  if (ssh) {
    const provider = HOST_TO_PROVIDER[ssh[1]];
    if (!provider) return null;
    return { owner: ssh[2], repo: ssh[3], provider };
  }

  // HTTPS: https://host/owner/repo.git
  const https = url.match(
    /https?:\/\/([^/]+)\/([^/]+)\/([^/.\s]+?)(?:\.git)?$/,
  );
  if (https) {
    const provider = HOST_TO_PROVIDER[https[1]];
    if (!provider) return null;
    return { owner: https[2], repo: https[3], provider };
  }

  return null;
}

/**
 * Detect git repo info by reading .git/config from a folder.
 * Returns null if the folder isn't a git repo or has no parseable origin remote.
 */
export function detectRepo(folderPath: string): RepoInfo | null {
  const gitConfigPath = path.join(folderPath, ".git", "config");
  if (!fs.existsSync(gitConfigPath)) return null;

  let content: string;
  try {
    content = fs.readFileSync(gitConfigPath, "utf-8");
  } catch {
    return null;
  }

  // Find [remote "origin"] section and extract url
  const originMatch = content.match(
    /\[remote "origin"\][^\[]*?url\s*=\s*(.+)/,
  );
  if (!originMatch) return null;

  return parseRemoteUrl(originMatch[1].trim());
}
