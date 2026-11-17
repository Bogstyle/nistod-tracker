// Installer les commandes dans UN serveur Discord de test.
const {DISCORD_BOT_TOKEN}=process.env;
// Identifiant public du serveur NisToD Tracker, surchargable via l'environnement.
const DISCORD_GUILD_ID=process.env.DISCORD_GUILD_ID;
// Identifiant public de l’application NisToD Tracker (peut être surchargé).
const DISCORD_APPLICATION_ID=process.env.DISCORD_APPLICATION_ID;
if(!DISCORD_APPLICATION_ID||!DISCORD_GUILD_ID||!DISCORD_BOT_TOKEN){
 console.error('Variables requises : DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN');process.exit(1);
}
const commands=[
 {name:'nistod-publier',description:'Publier le panneau NisToD dans le salon configuré (modération).',type:1,default_member_permissions:'32'},
 {name:'nistod-liste',description:'Consulter les prochaines fenêtres NisToD (réponse privée).',type:1},
 {name:'nistod-rafraichir',description:'Actualiser le tableau existant sans publier un nouveau message (modération).',type:1,default_member_permissions:'32'},
 {name:'nistod-retirer',description:'Invalider un ToD en cours et retirer le NM du tableau (modération).',type:1,default_member_permissions:'32',options:[
   {name:'nm',description:'NM à retirer du suivi actif',type:3,required:true,autocomplete:true},
   {name:'raison',description:'Motif de l’invalidation (facultatif)',type:3,required:false}
 ]}
];
const url=`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`;
const res=await fetch(url,{method:'PUT',headers:{authorization:`Bot ${DISCORD_BOT_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(commands)});
if(!res.ok){console.error(`Échec Discord : ${res.status} ${(await res.text()).slice(0,600)}`);process.exit(1)}
console.log('Commandes enregistrées :', (await res.json()).map(x=>x.name).join(', '));
