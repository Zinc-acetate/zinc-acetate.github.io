const fallbackProjects = [
  {
    name: "produce-science-video",
    description: "自主中文科普视频制作 Skill，覆盖研究、动画、配音字幕、封面与质量检查。",
    html_url: "https://github.com/Zinc-acetate/produce-science-video",
    language: "Python",
    stargazers_count: 1,
    pushed_at: "2026-07-18T09:45:24Z",
  },
  {
    name: "astrbot_plugin_codeforces_helper",
    description: "Codeforces training and rating helper plugin for AstrBot.",
    html_url: "https://github.com/Zinc-acetate/astrbot_plugin_codeforces_helper",
    language: "Python",
    stargazers_count: 2,
    pushed_at: "2026-07-18T08:17:35Z",
  },
];

module.exports = async function () {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "zinc-acetate-blog-build",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const response = await fetch(
      "https://api.github.com/users/Zinc-acetate/repos?sort=pushed&per_page=20&type=owner",
      { headers },
    );
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const excludedRepoIds = new Set([1304748004]);
    const repos = await response.json();
    const projects = repos
      .filter(
        (repo) =>
          !repo.fork &&
          repo.name.toLowerCase() !== "zinc-acetate.github.io" &&
          !excludedRepoIds.has(repo.id),
      )
      .slice(0, 3)
      .map((repo) => ({
        name: repo.name,
        description: repo.description || "查看仓库中的代码与说明。",
        html_url: repo.html_url,
        language: repo.language || "Repository",
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at,
      }));

    return projects.length ? projects : fallbackProjects;
  } catch {
    return fallbackProjects;
  }
};
