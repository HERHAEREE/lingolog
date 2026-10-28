import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { CityTheme } from '@/data/city-themes';
import { growthStages } from '@/growth/growth-model';
import { languageLabels } from '@/data/languages';

// Visual-only contract: replace this renderer with an image without changing rewards.
export function HouseGraphic({ stage, theme }: { stage: number; theme: CityTheme }) {
  const [width, setWidth] = useState(260);
  const tokyo = theme.renderer === 'tokyo-house';
  return <View accessible accessibilityRole="image" accessibilityLabel={`${theme.city}의 ${languageLabels[theme.learningLanguage]} 집 · ${growthStages[stage].name}`}
    onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.scene, tokyo && { backgroundColor: '#EEECE6' }]}>
    <View style={styles.sun} />
    <View style={[styles.cloud, { top: '13%', left: '10%' }]} /><View style={[styles.cloud, { top: '22%', right: '7%', width: '16%' }]} />
    {[9, 19, 72, 84].map((left, index) => <View key={left} style={[styles.skyline, { left: `${left}%`, height: `${(tokyo ? 14 : 22) + index * 5}%`, width: '8%', backgroundColor: tokyo ? '#DED9CF' : '#D3DED8' }]}>
      <View style={styles.cityWindow} /><View style={styles.cityWindow} /><View style={styles.cityWindow} />
    </View>)}
    {tokyo && <><View style={styles.tower} /><View style={styles.towerDeck} /><View style={styles.powerLine} /></>}
    <View style={styles.ground} /><View style={styles.path} />
    {stage === 0 && <View style={styles.plot} />}
    {stage >= 1 && <View style={styles.foundation} />}
    {stage >= 2 && <>
      <View style={[styles.roof, { borderLeftWidth: width * 0.31, borderRightWidth: width * 0.31, borderBottomWidth: width * (tokyo ? 0.14 : 0.18), borderBottomColor: tokyo ? '#5D6866' : '#846556' }]} />
      {tokyo && <View style={styles.eaves} />}
      <View style={[styles.house, { backgroundColor: tokyo ? (stage >= 3 ? '#DECFAE' : '#E7DECA') : stage >= 3 ? '#D99F83' : '#E6C7AE', borderColor: tokyo ? '#A79478' : '#B5866A' }]}>
        {[18, 56].map((top) => <View key={top} style={[styles.brickLine, { top: `${top}%` }]} />)}
        <View style={[styles.window, { left: '12%' }, tokyo && styles.shoji]}>{tokyo && <View style={styles.shojiBar} />}</View>
        <View style={[styles.window, { right: '12%' }, tokyo && styles.shoji]}>{tokyo && <View style={styles.shojiBar} />}</View>
        <View style={[styles.door, { backgroundColor: stage >= 3 ? (tokyo ? '#91765B' : '#365E54') : '#C5A68A' }, tokyo && { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}><View style={styles.handle} /></View>
        {stage >= 3 && <><View style={styles.doorFrame} /><View style={styles.steps} /></>}
        {stage >= 4 && <><View style={styles.flowerBox} /><View style={styles.awning} /></>}
      </View>
      {stage >= 3 && !tokyo && <View style={styles.chimney} />}
      {stage >= 3 && tokyo && <View style={styles.lantern} />}
    </>}
    {stage >= 4 && <>
      <View style={styles.treeTrunk} /><View style={[styles.treeCrown, tokyo && { backgroundColor: '#D9B5B5' }]} />
      {[14, 20, 75, 82].map((left, index) => <View key={left} style={[styles.flower, { left: `${left}%`, backgroundColor: index % 2 ? '#DAA25F' : '#B77577' }]} />)}
      <View style={styles.mailbox} /><View style={styles.lamp} />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 1.45, backgroundColor: '#EAF0E9', borderRadius: 20, overflow: 'hidden' },
  sun: { position: 'absolute', top: '9%', right: '20%', width: '13%', aspectRatio: 1, borderRadius: 100, backgroundColor: '#F1D9A4' },
  cloud: { position: 'absolute', width: '24%', height: '5%', borderRadius: 30, backgroundColor: '#F8F6EF' },
  skyline: { position: 'absolute', bottom: '24%', backgroundColor: '#D3DED8', gap: 7, padding: 7, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  cityWindow: { height: 5, backgroundColor: '#EAF0E9' },
  ground: { position: 'absolute', bottom: 0, width: '100%', height: '24%', backgroundColor: '#D9DCC6' },
  path: { position: 'absolute', bottom: 0, left: '42%', width: '16%', height: '24%', backgroundColor: '#EDE1CD', transform: [{ skewX: '-12deg' }] },
  plot: { position: 'absolute', bottom: '23%', left: '24%', width: '52%', height: '14%', borderWidth: 2, borderStyle: 'dashed', borderColor: '#9AA58C', borderRadius: 8, backgroundColor: '#E3DEC9' },
  foundation: { position: 'absolute', bottom: '22%', left: '23%', width: '54%', height: '8%', backgroundColor: '#AB9C86', borderTopWidth: 5, borderTopColor: '#D3C6AF', borderRadius: 3 },
  roof: { position: 'absolute', bottom: '61%', left: '19%', width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#846556' },
  house: { position: 'absolute', bottom: '28%', left: '27%', width: '46%', height: '36%', borderWidth: 2, borderColor: '#B5866A', borderRadius: 2 },
  brickLine: { position: 'absolute', width: '100%', borderTopWidth: 1, borderColor: '#C89378' },
  window: { position: 'absolute', top: '15%', width: '22%', height: '27%', backgroundColor: '#E9E0AC', borderWidth: 3, borderColor: '#F6ECDC', borderRadius: 3 },
  door: { position: 'absolute', bottom: 0, left: '38%', width: '24%', height: '46%', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  handle: { position: 'absolute', top: '60%', right: '15%', width: 3, height: 3, borderRadius: 3, backgroundColor: '#E1C487' },
  doorFrame: { position: 'absolute', bottom: 0, left: '36%', width: '28%', height: '48%', borderWidth: 2, borderColor: '#F3E5D0', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  steps: { position: 'absolute', bottom: -7, left: '31%', width: '38%', height: 7, borderTopWidth: 3, borderColor: '#BDAD93', backgroundColor: '#DDD0B9' },
  chimney: { position: 'absolute', bottom: '70%', left: '62%', width: '7%', height: '12%', backgroundColor: '#9D7963', borderTopWidth: 3, borderColor: '#796054' },
  flowerBox: { position: 'absolute', top: '44%', left: '9%', width: '28%', height: '7%', backgroundColor: '#7F9B74', borderBottomWidth: 3, borderColor: '#8D654D' },
  awning: { position: 'absolute', top: '45%', right: '8%', width: '29%', height: '8%', backgroundColor: '#E9D8B6', borderBottomWidth: 3, borderColor: '#52796B', borderRadius: 3 },
  treeTrunk: { position: 'absolute', bottom: '20%', left: '13%', width: '2%', height: '23%', backgroundColor: '#9D8068' },
  treeCrown: { position: 'absolute', bottom: '36%', left: '6%', width: '16%', aspectRatio: 0.85, backgroundColor: '#89A68A', borderRadius: 100 },
  flower: { position: 'absolute', bottom: '15%', width: '4%', aspectRatio: 1, borderRadius: 20, borderBottomWidth: 2, borderColor: '#6E8B63' },
  mailbox: { position: 'absolute', bottom: '21%', right: '18%', width: '6%', height: '6%', backgroundColor: '#6D9085', borderRadius: 4 },
  lamp: { position: 'absolute', bottom: '23%', right: '10%', width: '2%', height: '21%', backgroundColor: '#887B65', borderTopWidth: 6, borderColor: '#E4BD77' },
  tower: { position: 'absolute', bottom: '24%', right: '11%', height: '52%', width: '3%', backgroundColor: '#C0A497', transform: [{ skewX: '-5deg' }] },
  towerDeck: { position: 'absolute', bottom: '52%', right: '8%', height: '3%', width: '9%', backgroundColor: '#C0A497' },
  powerLine: { position: 'absolute', top: '30%', left: 0, width: '100%', height: 1, backgroundColor: '#C7BFAE', transform: [{ rotate: '-4deg' }] },
  eaves: { position: 'absolute', bottom: '60%', left: '17%', width: '66%', height: '4%', backgroundColor: '#5D6866', borderBottomWidth: 3, borderColor: '#8F9992', borderRadius: 4 },
  shoji: { backgroundColor: '#F1E9D5', borderColor: '#A79478', borderRadius: 0 },
  shojiBar: { position: 'absolute', top: '48%', width: '100%', height: 2, backgroundColor: '#A79478' },
  lantern: { position: 'absolute', bottom: '39%', left: '72%', width: '5%', height: '10%', borderRadius: 10, backgroundColor: '#C98670', borderTopWidth: 3, borderBottomWidth: 3, borderColor: '#776658' },
});
