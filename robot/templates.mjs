// Pre-translated fallback sentences, used when GitHub Models is unavailable. {name} is the cape name.
// Proper names stay in English in every language.
export const LANGS = ['En', 'He', 'Es', 'Pt', 'Fr', 'De', 'Ru'];

export const NEW_OBTAIN = {
  En: 'A new cape, **{name}**, was found on the Minecraft Wiki. **Check the official Minecraft news** for how to get it.',
  He: 'נמצאה גלימה חדשה, **{name}**, בוויקי של Minecraft. **בדקו בחדשות הרשמיות של Minecraft** איך משיגים אותה.',
  Es: 'Se encontró una capa nueva, **{name}**, en la wiki de Minecraft. **Consulta las noticias oficiales de Minecraft** para saber cómo conseguirla.',
  Pt: 'Uma capa nova, **{name}**, foi encontrada na wiki do Minecraft. **Veja as notícias oficiais do Minecraft** para saber como conseguir.',
  Fr: 'Une nouvelle cape, **{name}**, a été repérée sur le wiki Minecraft. **Consultez les actualités officielles de Minecraft** pour savoir comment l’obtenir.',
  De: 'Ein neuer Umhang, **{name}**, wurde im Minecraft-Wiki gefunden. **Sieh in den offiziellen Minecraft-News nach**, wie du ihn bekommst.',
  Ru: 'В вики Minecraft появился новый плащ — **{name}**. **Как его получить, смотрите в официальных новостях Minecraft**.'
};

export const NEW_SHORT = {
  En: '**New cape.** Check the official Minecraft news for how to get it.',
  He: '**גלימה חדשה.** בדקו בחדשות הרשמיות של Minecraft איך משיגים אותה.',
  Es: '**Capa nueva.** Consulta las noticias oficiales de Minecraft para conseguirla.',
  Pt: '**Capa nova.** Veja as notícias oficiais do Minecraft para conseguir.',
  Fr: '**Nouvelle cape.** Consultez les actualités officielles de Minecraft pour l’obtenir.',
  De: '**Neuer Umhang.** Sieh in den offiziellen Minecraft-News nach, wie du ihn bekommst.',
  Ru: '**Новый плащ.** Как получить — в официальных новостях Minecraft.'
};

// Event lines (the app puts the type label in front, so these start with the cape name).
export const EVENT = {
  new: {
    En: '{name}: a new cape was found.', He: '{name}: נמצאה גלימה חדשה.', Es: '{name}: se encontró una capa nueva.',
    Pt: '{name}: uma capa nova foi encontrada.', Fr: '{name} : une nouvelle cape a été repérée.', De: '{name}: ein neuer Umhang wurde gefunden.',
    Ru: '{name}: найден новый плащ.'
  },
  available: {
    En: '{name} can be obtained now.', He: 'אפשר להשיג עכשיו את {name}.', Es: 'Ya se puede conseguir {name}.',
    Pt: 'Já dá para pegar a {name}.', Fr: '{name} peut être obtenue dès maintenant.', De: '{name} ist jetzt erhältlich.',
    Ru: '{name} уже можно получить.'
  },
  ending: {
    En: '{name}: the promotion ends within 48 hours.', He: '{name}: המבצע נגמר בתוך 48 שעות.', Es: '{name}: la promoción termina en menos de 48 horas.',
    Pt: '{name}: a promoção acaba em menos de 48 horas.', Fr: '{name} : la promotion se termine dans moins de 48 heures.',
    De: '{name}: die Aktion endet in weniger als 48 Stunden.', Ru: '{name}: акция закончится в течение 48 часов.'
  },
  ended: {
    En: '{name}: the promotion has ended.', He: '{name}: המבצע הסתיים.', Es: '{name}: la promoción terminó.',
    Pt: '{name}: a promoção acabou.', Fr: '{name} : la promotion est terminée.', De: '{name}: die Aktion ist beendet.',
    Ru: '{name}: акция завершена.'
  }
};

export const fill = (s, name) => s.replaceAll('{name}', name);
