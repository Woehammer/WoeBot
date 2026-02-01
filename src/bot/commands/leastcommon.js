// ==================================================
// COMMAND: /leastimpact
// PURPOSE: Warscrolls pulling DOWN a faction's win rate
//          (Included win rate < faction baseline)
// ==================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { addChunkedSection } from "../ui/embedSafe.js";

export const data = new SlashCommandBuilder()
  .setName("leastimpact")
  .setDescription("Top warscrolls pulling DOWN a faction's win rate (vs faction baseline)")
  .addStringOption((opt) =>
    opt.setName("faction").setDescription("Faction name").setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("limit").setDescription("How many warscrolls to show (default 10, max 25)")
      .setRequired(false).setMinValue(1).setMaxValue(25)
  );

const HR = "──────────────";
function norm(s){return String(s??"").trim().toLowerCase();}
function pct(x){return Number.isFinite(x)?`${(x*100).toFixed(1)}%`:"—";}
function fmtPP(x){return Number.isFinite(x)?`${x>=0?"+":""}${x.toFixed(1)}pp`:"—";}
function fmtInt(x){return Number.isFinite(x)?`${Math.round(x)}`:"—";}
function fmtNum(x,dp=2){return Number.isFinite(x)?Number(x).toFixed(dp):"—";}
function shouldShowAvgOcc(avgOcc, includedGames){
  if(!Number.isFinite(avgOcc)) return false;
  if(avgOcc>=1.05) return true;
  if(Number.isFinite(includedGames) && includedGames>=10) return true;
  return false;
}
function getFactionChoices({system,engine}){
  let choices=system?.lookups?.factions?.map(f=>f.name)??[];
  if(choices.length) return choices;
  const byFaction=engine?.indexes?.get?.()?.byFaction;
  if(byFaction instanceof Map){
    return [...byFaction.values()].map(rows=>rows?.[0]?.Faction??rows?.[0]?.faction).filter(Boolean);
  }
  return [];
}
function findFactionName(system,engine,inputName){
  const q=norm(inputName);
  const factions=system?.lookups?.factions??[];
  for(const f of factions){
    if(norm(f.name)===q) return f.name;
    for(const a of f.aliases??[]) if(norm(a)===q) return f.name;
  }
  const byFaction=engine?.indexes?.get?.()?.byFaction;
  if(byFaction instanceof Map){
    if(byFaction.has(q)){
      const rows=byFaction.get(q);
      const any=rows?.[0];
      return any?.Faction??any?.faction??inputName;
    }
    for(const rows of byFaction.values()){
      const any=rows?.[0];
      const name=any?.Faction??any?.faction;
      if(name && norm(name)===q) return name;
    }
  }
  return null;
}
function getWarscrollCandidates(system,factionName){
  const q=norm(factionName);
  const ws=system?.lookups?.warscrolls??[];
  return ws.filter(w=>norm(w.faction)===q).map(w=>w.name);
}
function usedPctByGames(includedGames,factionGames){
  if(!Number.isFinite(includedGames)||!Number.isFinite(factionGames)||factionGames<=0) return null;
  return includedGames/factionGames;
}

export async function autocomplete(interaction,ctx){
  const focused=interaction.options.getFocused(true);
  if(focused.name!=="faction") return;
  const q=norm(focused.value);
  const choices=getFactionChoices(ctx);
  await interaction.respond(
    choices.filter(n=>!q||norm(n).includes(q)).slice(0,25).map(n=>({name:n,value:n}))
  );
}

export async function run(interaction,{system,engine}){
  const inputFaction=interaction.options.getString("faction",true).trim();
  const limit=interaction.options.getInteger("limit",false)??10;

  const factionName=findFactionName(system,engine,inputFaction);
  if(!factionName) return interaction.reply({content:`Couldn't match **${inputFaction}** to a known faction.`,ephemeral:true});

  const factionSummary=engine.indexes.factionSummary(factionName);
  if(!factionSummary?.games) return interaction.reply({content:`No data found for **${factionName}**.`,ephemeral:true});

  const factionWR=Number(factionSummary.winRate??0);
  const factionGames=Number(factionSummary.games??0);

  const candidates=getWarscrollCandidates(system,factionName);
  if(!candidates.length) return interaction.reply({content:`No warscroll lookup entries found for **${factionName}**.`,ephemeral:true});

  const rows=[];
  for(const wsName of candidates){
    const s=engine.indexes.warscrollSummaryInFaction(wsName,factionName,3);
    if(!s?.included) continue;

    const incGames=Number(s.included.games??0);
    const incWR=Number(s.included.winRate??NaN);
    if(!incGames||!Number.isFinite(incWR)) continue;

    if(!(incWR < factionWR)) continue; // pulling DOWN

    const withoutWR=Number(s.without?.winRate??NaN);
    const used=usedPctByGames(incGames,factionGames);

    const avgOcc=Number(s.included.avgOccurrencesPerList ?? s.included.avgOcc ?? s.included.avg_occurrences ?? NaN);

    rows.push({
      name: wsName,
      incWR,
      incGames,
      withoutWR,
      used,
      avgOcc,
      showAvgOcc: shouldShowAvgOcc(avgOcc, incGames),
      deltaPP: (incWR - factionWR) * 100, // negative
    });
  }

  // most negative first
  rows.sort((a,b)=>a.deltaPP - b.deltaPP);
  const top=rows.slice(0,limit);

  const header =
    `Baseline (faction overall win rate): **${pct(factionWR)}**.\n` +
    `Listed warscrolls: **win rate below baseline** (negative lift).`;

  const lines = top.length
    ? top.map((r,i)=>{
        const parts=[
          `Win: **${pct(r.incWR)}** (${fmtPP(r.deltaPP)} vs faction)`,
          `Win w/o: **${pct(r.withoutWR)}**`,
          `Used: **${pct(r.used)}**`,
          `Games: **${fmtInt(r.incGames)}**`,
        ];
        if(r.showAvgOcc) parts.push(`Avg occ: **${fmtNum(r.avgOcc,2)}**`);
        return `${i+1}. **${r.name}**\n${parts.join(" | ")}\n${HR}`;
      })
    : ["No warscrolls in the lookup are currently below the faction baseline."];

  const embed = new EmbedBuilder()
    .setTitle(`Top ${top.length || 0} warscrolls pulling DOWN — ${factionName}`)
    .setFooter({ text: "Woehammer GT Database" });

  addChunkedSection(embed,{ headerField:{name:"Overview",value:header}, lines });

  await interaction.reply({ embeds:[embed] });
}

export default { data, run, autocomplete };