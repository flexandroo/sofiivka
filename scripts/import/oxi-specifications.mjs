// Values below are transcribed from the manufacturer-linked manuals, never inferred from another model.
// Source page references and conflicts are retained per product in the batch and source audit.
export const manuals={
  evo:{id:'1wFMykPMbkdjltjrYZoCS65k2lwQZt9k1',file:'oxi-evo-manual-ua-rev07.pdf',revision:'EVO UA Rev.07',pages:28},
  cpSmall:{id:'1TnsSi7Y1cBW4K_AK-0QCiB_jfuk-mo95',file:'oxi-ceramic-pro-100-150-manual-ua-rev01.pdf',revision:'Ceramic PRO 100/150 UA Rev.01',pages:32},
  cpLarge:{id:'1XifZiN1cslBuqbOLZ3kz_GImlIIsDhNz',file:'oxi-ceramic-pro-200-1000-manual-ua-rev01.pdf',revision:'Ceramic PRO 200/1000 UA Rev.01',pages:32}
};
export function passportSpecifications(family,power,lined){
  if(family==='EVO'){
    const length=power<=26?601:power<=52?636:671;
    const group=power<=26?0:power<=52?1:2;
    return {manual:manuals.evo,length,width:lined?312:273,height:341,runW:48,ignitionW:407,minKw:[18,37,67][group],nominalGroupKw:[26,52,82][group],burnerWeight:(lined?[22,25,29]:[18,21,24])[group],vacuumPa:20,
      fireboxWidth:(lined?[201,221,241]:[142,162,182])[group],fireboxHeight:(lined?[169,190,210]:[139,160,180])[group],augerDiameter:70,
      dimensionReference:'Таблиця характеристик, с. 7; розміри EA/EB/EAC/EBC відповідної потужності, с. 9',
      dimensionsVersioned:true};
  }
  const powers=[100,150,200,250,300,400,500,600,700,800,1000];
  const index=powers.indexOf(power);
  if(index<0)throw Error(`No verified passport for CP-${power}`);
  const lengths=[877,970,1065,1065,1218,1218,1497,1497,1822,1822,1852];
  const widths=[430,430,562,562,702,702,702,702,832,832,984];
  const heights=[532,560,584,584,655,655,739,739,857,857,857];
  const run=[75,85,180,250,270,390,420,550,750,980,1020];
  const ignition=[475,520,505,620,625,730,770,920,1265,1565,1665];
  return {manual:power<=150?manuals.cpSmall:manuals.cpLarge,length:lengths[index],width:widths[index],height:heights[index],runW:run[index],ignitionW:ignition[index],
    minKw:[35,50,70,85,100,140,160,200,240,270,300][index],nominalGroupKw:power,burnerWeight:[71,75,135,140,195,200,290,310,450,490,640][index],
    fireboxWidth:[288,288,390,390,530,530,530,530,632,632,784][index],fireboxHeight:[268,323,379,379,423,423,507,507,623,623,623][index],
    vacuumPa:power<=150?20:power<=600?30:40,augerDiameter:power===100?70:power<=400?90:104,
    dimensionReference:'Таблиця технічних характеристик, с. 7–8',dimensionsVersioned:true};
}
