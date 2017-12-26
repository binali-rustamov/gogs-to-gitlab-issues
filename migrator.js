const mysql = require('mysql');
const gitlab = require('gitlab');

class Migrator {

    constructor(conf) {
        this._conf = conf;
        conf.db.multipleStatements = true;
        this._connection = mysql.createConnection(conf.db);
        this._api = gitlab(conf.gitlab);
        this._connection.connect();
    }

    async start() {
        let mappings = this._conf.mappings;
        for (let repoNameFromGogs in mappings) {
            if (!mappings.hasOwnProperty(repoNameFromGogs)) {
                continue;
            }
            let gitlabRepoPath = mappings[repoNameFromGogs];
            this.copyRepoIssues(repoNameFromGogs, gitlabRepoPath).catch(ex => console.log(ex));
        }
    }

    async copyRepoIssues(gogsRepo, gitLabRepo) {

        let issuesFromGogs = await this.getDataForRepo(gogsRepo);
        let i = 1;
        let count = issuesFromGogs.length;
        for (let gogsIssue of issuesFromGogs) {

            console.log(`(${i}/${count}) Copy issue #${gogsIssue.issueId} from ${gogsRepo} to ${gitLabRepo}...`);

            let issueData = {
                title: `Gogs_${gogsIssue.issueId}/${gogsIssue.title}`,
                description: `\r
Created by: ${gogsIssue.creator}  \r
Created on: ${gogsIssue.createdOn}  \r
\r
${gogsIssue.content}  \r
----------------  \r
${gogsIssue.comments}\r
`,
            };

            try {
                let createdIssueInGitLab = await this.createIssue(gitLabRepo, issueData);
                if (gogsIssue.closed) {
                    console.log("Issue already closed in Gogs, close in GitLab...");
                    let createdIssueId = createdIssueInGitLab.id;
                    await this.closeIssue(gitLabRepo, createdIssueId);
                }
                console.log("Created!");
            } catch (ex) {
                console.log(ex);
                console.log("Error occurred, please create this issue manually");
            }
            i++;
        }
        console.log(`Done - ${gogsRepo} to ${gitLabRepo}`);
    }

    getDataForRepo(repoName) {
        return new Promise((resolve, reject) => {

            this._connection.query(`
            SET group_concat_max_len=90000;
            SELECT 
    i.index issueId,
    i.is_closed closed,
    i.content content,
    i.name title,
    r.name repoName,
    u.name creator,
    FROM_UNIXTIME(i.created_unix, '%Y %D %M %h:%i:%s') createdOn,
    (SELECT 
            GROUP_CONCAT(DISTINCT CONCAT(cu.name, ' \\r\\n ', comment.content)
                    SEPARATOR '\\r\\n ------- \\r\\n')
        FROM
            comment
            join user cu on comment.poster_id = cu.id
        WHERE
            issue_id = i.id
        GROUP BY issue_id) comments
FROM
    issue i
        JOIN
    repository r ON i.repo_id = r.id
        JOIN
    \`user\` u ON u.id = i.poster_id where r.name = '${repoName}';`, function (error, results, fields) {
                if (error) reject(error);
                resolve(results[1]);
            });
        });
    }

    async createIssue(projectId, issueData) {
        return new Promise(resolve => {
            this._api.issues.create(projectId, issueData, (d) => {
                resolve(d);
            });
        });
    }

    async closeIssue(projectId, issueId) {
        return new Promise(resolve => {
            this._api.issues.edit(projectId, issueId, {state_event: 'close'}, (d) => {
                resolve(d);
            });
        });
    }
}

module.exports = Migrator;