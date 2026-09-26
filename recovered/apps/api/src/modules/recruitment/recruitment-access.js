// SPDX-License-Identifier: MIT
'use strict';
// Collection reads retain the four scope bind positions used by scoped APIs.
// Only this module derives company membership; it never changes stored grants.
const scopeColumns = ['legal_entity_id','region_id','project_id','responsibility_scope_id'];
const tuple = scope => scope.readScopes ? [null,null,null,scope.readScopes.map(row => row.responsibilityScopeId)] : [scope.legalEntityId,scope.regionId,scope.projectId,scope.responsibilityScopeId];
const whereScope = (alias='',first=1) => scopeColumns.map((column,index)=>`${alias}${column}=$${first+index}`).join(' AND ');
const whereRead = (scope,alias='',first=1) => scope.readScopes
  ? `$${first}::uuid IS NULL AND $${first+1}::uuid IS NULL AND $${first+2}::uuid IS NULL AND ${alias}responsibility_scope_id=ANY($${first+3}::uuid[])`
  : whereScope(alias,first);
// A project filter follows an application; a candidate without any application
// keeps its original project as a useful fallback for imported and new records.
const whereCandidates = (scope,alias='') => scope.readScopes ? whereRead(scope,alias) : `(
  (${whereScope(alias)} AND NOT EXISTS(SELECT 1 FROM recruitment_applications any_application WHERE any_application.candidate_id=${alias}id))
  OR (${alias}legal_entity_id=$1 AND EXISTS(SELECT 1 FROM recruitment_applications scoped_application WHERE scoped_application.candidate_id=${alias}id AND ${whereScope('scoped_application.')})))`;
async function companyScopes(client, actor) {
  const ids=[...new Set(actor.grants.filter(grant=>grant.personalDataVisible).map(grant=>grant.legalEntityId))];
  if(!ids.length) return [];
  return (await client.query(`SELECT p.legal_entity_id AS "legalEntityId",p.region_id AS "regionId",p.id AS "projectId",rs.id AS "responsibilityScopeId",
    le.name AS "legalEntityName",r.name AS "regionName",r.time_zone AS "timeZone",p.name AS "projectName",rs.name AS "scopeName",true AS "personalDataVisible"
    FROM responsibility_scopes rs JOIN projects p ON p.id=rs.project_id JOIN legal_entities le ON le.id=p.legal_entity_id JOIN regions r ON r.id=p.region_id
    WHERE p.legal_entity_id=ANY($1::uuid[]) ORDER BY le.name,p.name,rs.name,rs.id`,[ids])).rows;
}
module.exports={tuple,whereScope,whereRead,whereCandidates,companyScopes};
