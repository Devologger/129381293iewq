export async function GET(){return Response.json({configured:false,removed:true});}
export async function POST(){return Response.json({error:'Voice features have been retired. Use Ask Penguin in the dashboard.'},{status:410});}
