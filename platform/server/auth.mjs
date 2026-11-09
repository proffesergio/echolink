import {getAuth} from './identity.mjs';
import {env} from './env.mjs';
import {query,transaction,audit} from './db.mjs';
import {AppError,uuid} from './errors.mjs';
export async function verifyIdentity(request){
  const session=await getAuth().api.getSession({headers:request.headers});
  if(!session?.user)throw new AppError(401,'Sign in to your account.','sign_in_required');
  return {id:session.user.id,email:session.user.email,name:session.user.name,email_verified:session.user.emailVerified===true};
}
export async function provisionAccount(identity){
  const email=String(identity.email||'').toLowerCase(),verified=identity.email_verified===true;
  const owner=verified&&!!env().ownerEmail&&email===env().ownerEmail;
  return transaction(null,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['identity:'+identity.id]);
    let account=(await client.query('SELECT * FROM creator.accounts WHERE auth_subject=$1',[identity.id])).rows[0];
    // A fresh-start owner workspace may exist before OAuth consent. Only the
    // exact configured, verified owner identity can claim this reserved row.
    if(!account&&owner){const pending=(await client.query("SELECT * FROM creator.accounts WHERE lower(email)=$1 AND role='super_admin' AND auth_subject LIKE 'bootstrap-owner:%' FOR UPDATE",[email])).rows[0];if(pending)account=(await client.query('UPDATE creator.accounts SET auth_subject=$2 WHERE id=$1 RETURNING *',[pending.id,identity.id])).rows[0];}
    if(!account){
      account=(await client.query('INSERT INTO creator.accounts(auth_subject,email,name,email_verified,role) VALUES($1,$2,$3,$4,$5) RETURNING *',[identity.id,email,String(identity.name||email).slice(0,100),verified,owner?'super_admin':'admin'])).rows[0];
      const workspace=(await client.query('INSERT INTO creator.workspaces(name,owner_id) VALUES($1,$2) RETURNING *',[(identity.name||'My')+' workspace',account.id])).rows[0];
      await client.query("SELECT set_config('creator.workspace_id',$1,true)",[workspace.id]);
      await client.query("INSERT INTO creator.memberships(workspace_id,account_id,role) VALUES($1,$2,'owner')",[workspace.id,account.id]);
      await client.query("INSERT INTO creator.subscriptions(workspace_id,plan_id) VALUES($1,'free')",[workspace.id]);
      await audit(client,workspace.id,account,'account.created','account',account.id);
    }else{
      const updated=(await client.query('UPDATE creator.accounts SET email=$2,name=$3,email_verified=$4,role=$5,updated_at=now() WHERE id=$1 AND (email,name,email_verified,role) IS DISTINCT FROM ($2,$3,$4,$5) RETURNING *',[account.id,email,String(identity.name||email).slice(0,100),verified,owner?'super_admin':'admin'])).rows[0];if(updated)account=updated;
    }
    if(account.status!=='active')throw new AppError(403,'Your account is suspended. Contact the platform owner.','account_suspended');
    return account;
  });
}
export async function resolveActor(request,identityVerifier=verifyIdentity){
  const identity=await identityVerifier(request),account=await provisionAccount(identity);
  const requested=request.headers.get('x-workspace-id');if(requested&&!uuid(requested))throw new AppError(400,'Invalid workspace selection.');
  const workspaces=(await query('SELECT w.*,m.role AS membership_role FROM creator.workspaces w JOIN creator.memberships m ON m.workspace_id=w.id WHERE m.account_id=$1 ORDER BY w.created_at',[account.id])).rows;
  const workspace=requested?workspaces.find(w=>w.id===requested):workspaces[0];
  if(!workspace)throw new AppError(403,'You do not have access to this workspace.');
  if(workspace.status!=='active'&&account.role!=='super_admin')throw new AppError(403,'This workspace is suspended.','workspace_suspended');
  return {...account,workspaceId:workspace.id,workspace,workspaces};
}
export function requireOwner(actor){if(actor.role!=='super_admin'||!actor.email_verified)throw new AppError(403,'Only the verified platform owner can do this.');}
export function requireVerified(actor){if(!actor.email_verified)throw new AppError(403,'Verify your email or sign in with your verified Google account first.','email_verification_required');}
