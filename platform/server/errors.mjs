export class AppError extends Error{constructor(status,message,code='request_failed'){super(message);this.status=status;this.code=code;}}
export const requireValue=(condition,message,status=400)=>{if(!condition)throw new AppError(status,message);};
export const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const text=(value,max=200)=>String(value??'').trim().slice(0,max);
