import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Button, Empty, Screen, SectionTitle } from '@/components/ui';
import { useHere, usePlaces } from '@/lib/hooks';
import { longAgoFavourites, nearbyFavourites, randomFavourite, unrated, visible } from '@/lib/recommend';
import { radius, space, useColors } from '@/theme';

export default function HomeScreen() {
  const c = useColors();
  const { data: places, loaded } = usePlaces();
  const here = useHere();

  const likedCount = visible(places).filter((p) => p.rating === 'up').length;
  const longAgo = longAgoFavourites(places);
  const near = here ? nearbyFavourites(places, here) : [];
  const toRate = unrated(places);

  const pick = () => {
    const p = randomFavourite(places);
    if (p) router.push({ pathname: '/place/[id]', params: { id: p.id, pick: '1' } });
  };

  return (
    <Screen>
      <View style={[styles.hero, { backgroundColor: c.accent }]}>
        <Text style={styles.heroTitle}>Hova menjünk ma?</Text>
        <Text style={styles.heroText}>
          {likedCount
            ? `${likedCount} kedvenc helyed van – válassz, vagy bízd a véletlenre.`
            : 'Értékeld a helyeidet, és innen ajánlok.'}
        </Text>
        <Button label="🎲  Dobj egy kedvencet" kind="soft" onPress={pick} disabled={!likedCount} style={styles.heroBtn} />
      </View>

      <Text style={{ color: c.muted, marginTop: space.m, fontSize: 13 }}>
        📍 {here ? here.label : 'Helyzet nélkül – engedélyezd a helyhozzáférést a közeli ajánlásokhoz.'}
      </Text>

      <SectionTitle title="Rég jártál itt – pedig szeretted" />
      {longAgo.length ? (
        longAgo.map((p) => <PlaceRow key={p.id} p={p} here={here} />)
      ) : (
        <Empty text={loaded ? 'Még nincs olyan kedvenced, ahol 30+ napja jártál.' : 'Betöltés…'} />
      )}

      {here ? (
        <>
          <SectionTitle title="Kedvencek a közelben" />
          {near.length ? near.map((p) => <PlaceRow key={p.id} p={p} here={here} />) : <Empty text="Még nincs 👍-os helyed." />}
        </>
      ) : null}

      <SectionTitle title="Milyen volt?" hint="értékeld egy koppintással" />
      {toRate.length ? (
        toRate.map((p) => <PlaceRow key={p.id} p={p} here={here} quickRate />)
      ) : (
        <Empty text="Minden helyet értékeltél. 🎉" />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.l + 4, padding: space.l + 2 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  heroText: { color: '#fff', opacity: 0.92, marginTop: space.xs, marginBottom: space.m },
  heroBtn: { alignSelf: 'flex-start', backgroundColor: '#fff' },
});
