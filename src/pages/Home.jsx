import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { useAuth } from '../store/AuthProvider.jsx';
import { Icon, ProgressBar } from '../components/ui.jsx';
import { SkyThumb } from '../components/Sky.jsx';
import { nearestFrame } from '../lib/hips.js';
import { currentSurvey } from '../lib/mission.js';

const CARDS = [
  {
    to: '/explorer', icon: 'satellite_alt', color: 'from-sky/30', ring: 'text-sky',
    es: ['Estrellas que se mueven', 'Compara fotos del cielo tomadas con 25 años de diferencia y descubre qué estrellas se han desplazado.'],
    en: ['Moving stars', 'Compare sky photos taken 25 years apart and spot which stars have moved.'],
  },
  {
    to: '/candidates', icon: 'near_me', color: 'from-secondary/30', ring: 'text-secondary',
    es: ['Asteroides cercanos', 'Mira los asteroides que pasan cerca de la Tierra esta semana, con datos reales de NASA.'],
    en: ['Nearby asteroids', 'See the asteroids passing near Earth this week, with real NASA data.'],
  },
  {
    to: '/archive', icon: 'public', color: 'from-primary/30', ring: 'text-primary',
    es: ['Mapa de todo el cielo', 'Recorre el cielo completo fotografiado por SPHEREx, con la Vía Láctea brillando en el centro.'],
    en: ['Whole-sky map', 'Tour the full sky photographed by SPHEREx, with the Milky Way glowing across it.'],
  },
  {
    to: '/spectra', icon: 'palette', color: 'from-tertiary/30', ring: 'text-tertiary',
    es: ['Colores invisibles', 'SPHEREx ve 102 “colores” de luz infrarroja. Descubre de qué están hechas las nubes del espacio.'],
    en: ['Invisible colours', 'SPHEREx sees 102 “colours” of infrared light. Find out what space clouds are made of.'],
  },
  {
    to: '/citizen', icon: 'sports_esports', color: 'from-secondary/30', ring: 'text-secondary',
    es: ['Juega y aprende', '¿Puedes ver qué se mueve? Pon a prueba tu ojo y gana puntos y medallas.'],
    en: ['Play & learn', 'Can you tell what moves? Test your eye and earn points and badges.'],
  },
  {
    to: '/telemetry', icon: 'travel_explore', color: 'from-sky/30', ring: 'text-sky',
    es: ['¿Dónde está SPHEREx?', 'Sigue en directo al telescopio mientras da la vuelta a la Tierra cada 98 minutos.'],
    en: ['Where is SPHEREx?', 'Follow the telescope live as it circles Earth every 98 minutes.'],
  },
];

export default function Home() {
  const { L, fmtNum } = useI18n();
  const store = useStore();
  const { user, cloudEnabled } = useAuth();
  const survey = currentSurvey();

  return (
    <div className="px-4 lg:px-8 py-6 space-y-8 max-w-6xl">
      <section className="relative overflow-hidden rounded-2xl bg-surface-container-low p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-5 gap-6 items-center">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
        <div className="lg:col-span-3 space-y-4 relative">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/15 text-secondary font-label text-sm">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" /> {L('Datos reales de NASA', 'Real NASA data')}
          </span>
          <h1 className="font-headline font-bold text-3xl lg:text-5xl leading-tight">
            {store.profile.name ? L(`¡Hola, ${store.profile.name}!`, `Hi, ${store.profile.name}!`) : L('¡Hola, explorador/a del cielo!', 'Hello, sky explorer!')}
          </h1>
          <p className="text-lg text-on-surface-variant max-w-xl">
            {L(
              'SPHEREx es un telescopio espacial de NASA que fotografía todo el cielo cada seis meses. Aquí puedes usar sus fotos para descubrir cosas tú mismo/a.',
              'SPHEREx is a NASA space telescope that photographs the whole sky every six months. Here you can use its pictures to make discoveries yourself.',
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/explorer" className="px-6 py-3 rounded-xl bg-primary text-on-primary font-headline font-bold text-lg flex items-center gap-2 shadow-lg">
              <Icon name="play_arrow" className="text-2xl" /> {L('Empezar a explorar', 'Start exploring')}
            </Link>
            {!user && (
              <Link to="/account" className="px-6 py-3 rounded-xl bg-surface-container-high text-on-surface font-headline font-semibold text-lg flex items-center gap-2">
                <Icon name="person_add" className="text-2xl" /> {cloudEnabled ? L('Crear cuenta', 'Create account') : L('Mi perfil', 'My profile')}
              </Link>
            )}
          </div>
        </div>
        <div className="lg:col-span-2 relative">
          <SkyThumb survey="spherex" ra={246.6} dec={-24.4} fovDeg={2.5} size={256} frame={nearestFrame(3.3)} colormap="neon" className="w-full aspect-square rounded-2xl shadow-2xl" />
          <div className="absolute bottom-3 left-3 right-3 bg-surface/85 backdrop-blur rounded-lg px-3 py-2 text-sm">
            <strong>{L('Nube de Rho Ophiuchi', 'Rho Ophiuchi cloud')}</strong> · {L('vista por SPHEREx en luz infrarroja (3.3 µm)', 'seen by SPHEREx in infrared light (3.3 µm)')}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-headline font-bold text-2xl">{L('¿Qué quieres hacer hoy?', 'What would you like to do today?')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((c) => (
            <Link key={c.to} to={c.to} className={`group p-5 rounded-2xl bg-gradient-to-br ${c.color} to-surface-container hover:scale-[1.02] transition-transform space-y-2`}>
              <Icon name={c.icon} className={`text-4xl ${c.ring}`} />
              <div className="font-headline font-bold text-xl text-on-surface">{L(c.es[0], c.en[0])}</div>
              <p className="text-base text-on-surface-variant">{L(c.es[1], c.en[1])}</p>
              <span className={`inline-flex items-center gap-1 font-label font-semibold ${c.ring}`}>
                {L('Ir', 'Go')} <Icon name="arrow_forward" className="group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-surface-container space-y-3">
          <h2 className="font-headline font-bold text-xl flex items-center gap-2"><Icon name="emoji_events" className="text-tertiary" /> {L('Tu progreso', 'Your progress')}</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center"><Icon name={store.profile.avatar || 'rocket_launch'} className="text-on-primary text-4xl" /></div>
            <div className="flex-1">
              <div className="font-headline font-bold text-lg">{L('Nivel', 'Level')} {store.level} · {store.xp} XP</div>
              <ProgressBar value={(store.xp % 100) / 100} tone="primary" className="h-2 my-1" />
              <div className="text-sm text-on-surface-variant">{store.classifications.length} {L('descubrimientos clasificados', 'discoveries classified')}</div>
            </div>
          </div>
          <div className={`text-sm flex items-center gap-2 ${user ? 'text-secondary' : 'text-on-surface-variant'}`}>
            <Icon name={user ? 'cloud_done' : 'smartphone'} />
            {user ? L('Tu progreso se guarda en la nube.', 'Your progress is saved in the cloud.') : L('Tu progreso se guarda solo en este dispositivo.', 'Your progress is only saved on this device.')}
            {!user && <Link to="/account" className="text-secondary underline">{L('Guárdalo en la nube', 'Save it to the cloud')}</Link>}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-surface-container space-y-3">
          <h2 className="font-headline font-bold text-xl flex items-center gap-2"><Icon name="lightbulb" className="text-secondary" /> {L('¿Sabías que…?', 'Did you know…?')}</h2>
          <ul className="space-y-2 text-base text-on-surface-variant">
            <li>🌌 {L('SPHEREx ya terminó', 'SPHEREx has already completed')} {survey.k - 1} {L('mapas completos del cielo y va por el', 'full sky maps and is')} {fmtNum(survey.progress * 100, 0)}% {L('del siguiente.', 'through the next one.')}</li>
            <li>⭐ {L('La Estrella de Barnard se mueve tan rápido que en 25 años avanza casi una séptima parte del ancho de la Luna llena.', 'Barnard’s Star moves so fast that in 25 years it shifts almost a seventh of the full Moon’s width.')}</li>
            <li>🧊 {L('SPHEREx busca hielo de agua en nubes donde nacen estrellas y planetas.', 'SPHEREx looks for water ice in clouds where stars and planets are born.')}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
