

import React, {

  useCallback,

  useContext,

  useEffect,

  useState,

  createContext,

} from 'react';

import {

  ActivityIndicator,

  Alert,

  FlatList,

  Image,

  SafeAreaView,

  ScrollView,

  StatusBar,

  StyleSheet,

  Text,

  TextInput,

  TouchableOpacity,

  View,

  Dimensions,

  Platform, // ✅ ajouté

} from 'react-native';

import {

  NavigationContainer,

  CommonActions,

} from '@react-navigation/native';

import {createNativeStackNavigator} from '@react-navigation/native-stack';

// ✅ ajouté

import {
  getMessaging,
  getToken as getFirebaseMessagingToken,
  onTokenRefresh,
} from '@react-native-firebase/messaging';

import {

  api,

  saveToken,

  clearToken,

  getToken,

} from './api';

import {

  preparePushRegistration,

  registerPushNotifications,

  listenForPush,

  getInstallationId, // ✅ ajouté (à exporter depuis notifications.js)

} from './notifications';

const Stack = createNativeStackNavigator();

const AuthContext = createContext(null);

const COLORS = {

  background: '#E8EAF6',

  card: '#FFFFFF',

  primary: '#1A1A1A',

  accent: '#FFA500',

  textGray: '#8E8E93',

  inputBg: '#F5F6FA',

  danger: '#C62828',

  success: '#16803D',

};

const CATEGORIES = [

  'Tous',

  'Pizza',

  'Burger',

  'Frites',

  'Drink',

  'Poulet',

  'Porcs',

  'Poissons',

  'Legumes',

  'Chevres',

  'Vaches',

  'Lapins',

  'Dindons',

  'Gibiers',

];

const CATEGORY_ALIASES = {

  Pizza: ['pizza', 'pizzas'],

  Burger: ['burger', 'burgers'],

  Frites: ['frite', 'frites', 'accompagnement', 'accompagnements'],

  Drink: ['drink', 'drinks', 'boisson', 'boissons'],

  Porcs: ['porc', 'porcs'],

  Poissons: ['poisson', 'poissons'],

  Legumes: ['legume', 'legumes'],

  Chevres: ['chevre', 'chevres'],

  Vaches: ['vache', 'vaches', 'boeuf', 'boeufs'],

  Lapins: ['lapin', 'lapins'],

  Dindons: ['dindon', 'dindons', 'dinde', 'dindes'],

  Gibiers: ['gibier', 'gibiers'],

  Poulet: ['poulet', 'poulets', 'volaille', 'volailles'],

};

const MEAL_GROUPS = [

  {key: 'base', label: 'Base'},

  {key: 'viande', label: 'Viande'},

  {key: 'accompagnement', label: 'Accompagnement'},

  {key: 'legumes', label: 'Légumes'},

  {key: 'boisson', label: 'Boisson'},

  {key: 'supplements', label: 'Suppléments'},

];

function errorMessage(error) {

  if (typeof error === 'string') return error;

  return error?.message || 'Une erreur inattendue est survenue.';

}

function logError(context, error) {

  console.error(`[FASTFOOD ${context}]`, error?.stack || error);

}

function money(value) {

  const amount = Number(value);

  return new Intl.NumberFormat('fr-FR', {

    style: 'currency',

    currency: 'GBP',

  }).format(Number.isFinite(amount) ? amount : 0);

}

function normalizeText(value) {

  return String(value ?? '')

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .toLowerCase()

    .trim()

    .replace(/\s+/g, ' ');

}

function Button({

  title,

  onPress,

  secondary = false,

  disabled = false,

  style,

}) {

  return (

    <TouchableOpacity

      accessibilityRole="button"

      activeOpacity={0.75}

      onPress={onPress}

      disabled={disabled}

      style={[

        styles.button,

        secondary ? styles.secondaryButton : styles.primaryButton,

        disabled && styles.disabledButton,

        style,

      ]}>

      <Text

        style={[

          styles.buttonText,

          secondary && {color: COLORS.primary},

        ]}>

        {title}

      </Text>

    </TouchableOpacity>

  );

}

function Field({

  label,

  value,

  onChangeText,

  secureTextEntry = false,

  keyboardType = 'default',

  autoCapitalize = 'sentences',

  placeholder,

  multiline = false,

  maxLength,

}) {

  return (

    <View style={styles.field}>

      <Text style={styles.label}>{label}</Text>

      <TextInput

        style={[

          styles.input,

          multiline && styles.multilineInput,

        ]}

        value={value}

        onChangeText={onChangeText}

        secureTextEntry={secureTextEntry}

        keyboardType={keyboardType}

        autoCapitalize={autoCapitalize}

        autoCorrect={false}

        placeholder={placeholder || label}

        placeholderTextColor={COLORS.textGray}

        multiline={multiline}

        maxLength={maxLength}

      />

    </View>

  );

}

function LoadingView({text = 'Chargement…'}) {

  return (

    <View style={styles.loadingContainer}>

      <ActivityIndicator size="large" color={COLORS.accent} />

      <Text style={styles.description}>{text}</Text>

    </View>

  );

}

// ---------------------------------------------------------------------

// CONNEXION

// ---------------------------------------------------------------------

function LoginScreen({navigation, route}) {

  const auth = useContext(AuthContext);

  const [email, setEmail] = useState(route?.params?.email || '');

  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);

  async function submit() {

    if (busy) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {

      Alert.alert(

        'Champs requis',

        'Saisissez votre e-mail et votre mot de passe.',

      );

      return;

    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {

      Alert.alert('E-mail invalide', 'Saisissez un e-mail valide.');

      return;

    }

    setBusy(true);

    try {

      const data = await api('/api/auth/login', {

        method: 'POST',

        body: JSON.stringify({

          email: cleanEmail,

          password,

        }),

      });

      if (!data?.token) {

        throw new Error(

          data?.message ||

            data?.error ||

            'Le serveur n’a pas renvoyé de jeton de connexion.',

        );

      }

      await saveToken(data.token);

      const connected = await auth.reload();

      if (!connected) {

        await clearToken();

        throw new Error(

          'Connexion refusée lors de la vérification de la session. Vérifiez la route /api/auth/me.',

        );

      }

    } catch (error) {

      logError('CONNEXION', error);

      Alert.alert('Connexion impossible', errorMessage(error));

    } finally {

      setBusy(false);

    }

  }

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView

        contentContainerStyle={styles.content}

        keyboardShouldPersistTaps="handled">

        <Text style={styles.logo}>FastFood One</Text>

        <Text style={styles.subtitle}>

          Commandez. Récupérez. Savourez.

        </Text>

        <Field

          label="E-mail"

          value={email}

          onChangeText={setEmail}

          keyboardType="email-address"

          autoCapitalize="none"

        />

        <Field

          label="Mot de passe"

          value={password}

          onChangeText={setPassword}

          secureTextEntry

          autoCapitalize="none"

        />

        <Button

          title={busy ? 'Connexion…' : 'Se connecter'}

          onPress={submit}

          disabled={busy}

        />

        <Button

  title="TEST FCM TOKEN"

  secondary

  onPress={testFCMToken}

  disabled={busy}

/>

        <Button

          title="Créer un compte"

          secondary

          onPress={() => navigation.navigate('Register')}

          disabled={busy}

        />

      </ScrollView>

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// INSCRIPTION

// ---------------------------------------------------------------------

function RegisterScreen({navigation}) {

  const auth = useContext(AuthContext);

  const [name, setName] = useState('');

  const [email, setEmail] = useState('');

  const [phone, setPhone] = useState('');

  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState('');

  async function submit() {

    if (busy) return;

    const cleanName = name.trim();

    const cleanEmail = email.trim().toLowerCase();

    const cleanPhone = phone.trim();

    if (!cleanName || !cleanEmail || !cleanPhone || !password) {

      Alert.alert(

        'Champs requis',

        'Remplissez le nom, l’e-mail, le téléphone et le mot de passe.',

      );

      return;

    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {

      Alert.alert('E-mail invalide', 'Saisissez un e-mail valide.');

      return;

    }

    if (password.length < 10 || password.length > 72) {

      Alert.alert(

        'Mot de passe invalide',

        'Utilisez entre 10 et 72 caractères.',

      );

      return;

    }

    setBusy(true);

    let etape = 'Initialisation';

    let accountCreated = false;

    let fcm = null;

    try {

      // 1. FCM est requis pour atteindre l’objectif : le compte ne sera pas
      // envoyé au serveur si le téléphone ne peut pas obtenir son token.
      etape = 'Préparation du token FCM';
      setStatus('Activation des notifications…');

      const registration = await preparePushRegistration();

      const fcmToken =
        typeof registration?.token === 'string'
          ? registration.token.trim()
          : '';

      const installationId =
        typeof registration?.installationId === 'string'
          ? registration.installationId.trim()
          : '';

      if (fcmToken.length < 20) {
        throw new Error(
          'Aucun token FCM valide n’a été obtenu. Vérifiez Google Play Services, Firebase et les autorisations de notifications.',
        );
      }

      if (!installationId) {
        throw new Error(
          'L’identifiant unique de cette installation est absent. Vérifiez getInstallationId() dans notifications.js.',
        );
      }

      fcm = {
        token: fcmToken,
        installationId,
        platform: Platform.OS,
        deviceLabel: `${Platform.OS} FastFood One`,
      };

      console.log('[FCM] Token obtenu, longueur :', fcm.token.length);
      console.log('[FCM] Installation ID obtenu.');

      // 2. Envoyer le token FCM dans la même requête que l’inscription.
      // Le backend doit enregistrer fcm dans user_devices et répondre
      // avec token, user et fcmRegistered: true.
      etape = 'Création du compte et enregistrement FCM';
      setStatus('Création du compte et enregistrement des notifications…');

      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          password,
          fcm,
        }),
      });

      if (!data?.token || !data?.user) {
        throw new Error(
          data?.message ||
            data?.error ||
            'Réponse invalide : le serveur doit renvoyer token et user.',
        );
      }

      accountCreated = true;

      if (data.fcmRegistered !== true) {
        throw new Error(
          'Le serveur a créé une réponse d’inscription, mais n’a pas confirmé l’enregistrement du token FCM. Vérifiez backend/src/routes/auth.js.',
        );
      }

      // 3. Sauvegarder le jeton de session.

      etape = 'Enregistrement de la session';

      await saveToken(data.token);

      // 4. Vérifier la session avant de continuer.

      etape = 'Vérification de la session';

      const connected = await auth.reload();

      if (!connected) {

        throw new Error(

          'Compte créé, mais session non validée. Vérifiez /api/auth/me.',

        );

      }

      // Le backend a déjà enregistré le token FCM dans /register.
      // Ne pas appeler /api/auth/fcm-token une deuxième fois ici.
      console.log('[FCM] Le serveur confirme fcmRegistered=true.');
      Alert.alert(
        'Inscription réussie',
        'Votre compte est créé. Les notifications FCM sont enregistrées.',
      );

    } catch (error) {

      logError(`INSCRIPTION — ${etape}`, error);

      if (accountCreated) {

        Alert.alert(

          'Compte créé',

          `La création du compte a réussi, mais une étape suivante a échoué.\n\nÉtape : ${etape}\nErreur : ${errorMessage(error)}\n\nEssayez de vous reconnecter sans recréer le compte.`,

        );

      } else {

        Alert.alert(

          'Inscription impossible',

          `Étape : ${etape}\nErreur : ${errorMessage(error)}`,

        );

      }

    } finally {

      setBusy(false);

      setStatus('');

    }

  }

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView

        contentContainerStyle={styles.content}

        keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Créer un compte</Text>

        <Field

          label="Nom complet"

          value={name}

          onChangeText={setName}

          autoCapitalize="words"

        />

        <Field

          label="E-mail"

          value={email}

          onChangeText={setEmail}

          keyboardType="email-address"

          autoCapitalize="none"

        />

        <Field

          label="Téléphone"

          value={phone}

          onChangeText={setPhone}

          keyboardType="phone-pad"

        />

        <Field

          label="Mot de passe (10 à 72 caractères)"

          value={password}

          onChangeText={setPassword}

          secureTextEntry

          autoCapitalize="none"

        />

        {busy && <LoadingView text={status} />}

        <Button

          title={busy ? 'Inscription en cours…' : 'Créer mon compte'}

          onPress={submit}

          disabled={busy}

        />

        <Button

          title="Retour à la connexion"

          secondary

          onPress={() => navigation.goBack()}

          disabled={busy}

        />

      </ScrollView>

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// MENU, RECHERCHE, FILTRES ET PRODUITS

// ---------------------------------------------------------------------

function MenuScreen({navigation}) {

  const [products, setProducts] = useState([]);

  const [cart, setCart] = useState({});

  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');

  const [activeFilter, setActiveFilter] = useState('Tous');

  const load = useCallback(async (showAlert = false) => {

    try {

      const data = await api('/api/products');

      if (!Array.isArray(data?.products)) {

        throw new Error(

          'Le serveur n’a pas renvoyé de liste de produits valide.',

        );

      }

      setProducts(data.products);

    } catch (error) {

      logError('CHARGEMENT DES PRODUITS', error);

      if (showAlert) {

        Alert.alert('Produits indisponibles', errorMessage(error));

      }

    } finally {

      setLoading(false);

    }

  }, []);

  useEffect(() => {

    load(false);

    const timer = setInterval(() => {

      load(false);

    }, 30000);

    return () => clearInterval(timer);

  }, [load]);

  const query = normalizeText(searchText);

  const filteredProducts = products.filter(product => {

    const searchable = normalizeText(

      [

        product.name,

        product.description,

        product.category,

      ]

        .filter(Boolean)

        .join(' '),

    );

    const words = query.split(' ').filter(Boolean);

    const matchesSearch = words.every(word =>

      searchable.includes(word),

    );

    const category = normalizeText(product.category);

    const accepted = (

      CATEGORY_ALIASES[activeFilter] || [activeFilter]

    ).map(normalizeText);

    const matchesCategory =

      activeFilter === 'Tous' || accepted.includes(category);

    return matchesSearch && matchesCategory;

  });

  const cartCount = Object.values(cart).reduce(

    (sum, quantity) => sum + Number(quantity || 0),

    0,

  );

  function addToCart(product) {

    setCart(current => ({

      ...current,

      [product.id]: (current[product.id] || 0) + 1,

    }));

  }

  return (

    <SafeAreaView style={styles.screen}>

      <StatusBar barStyle="dark-content" />

    <View style={{paddingHorizontal: 20, paddingTop: 8}}>

      <Button

        title="TEST FCM TOKEN"

        secondary

        onPress={testFCMToken}

      />

    </View>

      <View style={styles.topRow}>

        <View style={{flex: 1}}>

          <Text style={styles.greetingText}>What makes the</Text>

          <Text style={styles.title}>perfect pizza?</Text>

        </View>

        <TouchableOpacity

          style={styles.cartButton}

          onPress={() =>

            navigation.navigate('Cart', {

              cart,

              products,

              setCart,

            })

          }>

          <Text style={styles.cartIcon}>🛒</Text>

          {cartCount > 0 && (

            <View style={styles.cartBadge}>

              <Text style={styles.cartBadgeText}>{cartCount}</Text>

            </View>

          )}

        </TouchableOpacity>

      </View>

      <View style={styles.searchBar}>

        <Text style={styles.searchIcon}>🔍</Text>

        <TextInput

          placeholder="Rechercher un plat, une viande, une boisson…"

          style={styles.searchInput}

          value={searchText}

          onChangeText={setSearchText}

          placeholderTextColor={COLORS.textGray}

          autoCapitalize="none"

          autoCorrect={false}

          returnKeyType="search"

          accessibilityLabel="Rechercher un produit"

        />

        {searchText.length > 0 && (

          <TouchableOpacity

            onPress={() => setSearchText('')}

            style={styles.clearSearchButton}>

            <Text style={styles.clearSearchText}>✕</Text>

          </TouchableOpacity>

        )}

      </View>

      <ScrollView

        horizontal

        showsHorizontalScrollIndicator={false}

        keyboardShouldPersistTaps="handled"

        style={styles.filtersScroll}

        contentContainerStyle={styles.filterRow}>

        {CATEGORIES.map(category => (

          <TouchableOpacity

            key={category}

            style={[

              styles.filterBtn,

              activeFilter === category && styles.activeFilter,

            ]}

            onPress={() => setActiveFilter(category)}>

            <Text

              style={[

                styles.filterText,

                activeFilter === category &&

                  styles.activeFilterText,

              ]}>

              {{

                Tous: 'Tous',

                Drink: 'Boissons',

                Legumes: 'Légumes',

                Chevres: 'Chèvres',

              }[category] || category}

            </Text>

          </TouchableOpacity>

        ))}

      </ScrollView>

      {loading ? (

        <LoadingView text="Chargement des plats…" />

      ) : (

        <ScrollView

          showsVerticalScrollIndicator={false}

          keyboardShouldPersistTaps="handled"

          contentContainerStyle={{paddingBottom: 40}}>

          <View style={styles.sectionHeader}>

            <Text style={styles.sectionTitle}>Nos plats</Text>

            <TouchableOpacity onPress={() => load(true)}>

              <Text style={styles.linkText}>Actualiser</Text>

            </TouchableOpacity>

          </View>

          {filteredProducts.length === 0 ? (

            <View style={styles.emptySearch}>

              <Text style={styles.emptySearchIcon}>🔎</Text>

              <Text style={styles.emptySearchTitle}>

                {searchText.trim()

                  ? 'Aucun résultat trouvé'

                  : 'Aucun produit disponible'}

              </Text>

              <Text style={styles.emptySearchText}>

                Essayez une autre recherche ou une autre catégorie.

              </Text>

            </View>

          ) : (

            <FlatList

              data={filteredProducts}

              keyExtractor={item => String(item.id)}

              horizontal

              nestedScrollEnabled

              showsHorizontalScrollIndicator={false}

              contentContainerStyle={styles.horizontalList}

              renderItem={({item}) => (

                <View style={styles.productCard}>

                  <View style={styles.imageContainer}>

                    {item.image_url ? (

                      <Image

                        source={{uri: item.image_url}}

                        style={styles.productImage}

                        resizeMode="cover"

                      />

                    ) : (

                      <View style={styles.imagePlaceholder}>

                        <Text style={{fontSize: 50}}>🍕</Text>

                      </View>

                    )}

                  </View>

                  <View style={styles.cardContent}>

                    <Text style={styles.productName} numberOfLines={2}>

                      {item.name}

                    </Text>

                    <Text style={styles.description} numberOfLines={2}>

                      {item.description || item.category || ''}

                    </Text>

                    <Text style={styles.price}>

                      {money(item.price)}

                    </Text>

                    <Text style={styles.ratingText}>

                      ★ {Number(item.average_rating || 0).toFixed(1)} (

                      {Number(item.rating_count || 0)})

                    </Text>

                    <TouchableOpacity

                      onPress={() =>

                        navigation.navigate('RateMeal', {

                          product: item,

                        })

                      }>

                      <Text style={styles.linkText}>Évaluer ★</Text>

                    </TouchableOpacity>

                    <Button

                      title="Ajouter +"

                      onPress={() => addToCart(item)}

                    />

                  </View>

                </View>

              )}

            />

          )}

          <View style={styles.bottomNav}>

            <Button

              title="Composer un repas"

              secondary

              style={styles.navBtn}

              onPress={() => navigation.navigate('MealComposer')}

            />

            <Button

              title="Mes commandes"

              secondary

              style={styles.navBtn}

              onPress={() => navigation.navigate('Orders')}

            />

            <Button

              title="Mon compte"

              secondary

              style={styles.navBtn}

              onPress={() => navigation.navigate('Account')}

            />

          </View>

        </ScrollView>

      )}

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// COMPOSITION PERSONNALISÉE

// ---------------------------------------------------------------------

function MealComposerScreen({navigation}) {

  const [groups, setGroups] = useState({});

  const [selected, setSelected] = useState({});

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);

  const [notes, setNotes] = useState('');

  useEffect(() => {

    let active = true;

    api('/api/meal-options')

      .then(data => {

        if (active) {

          setGroups(data?.groups || {});

        }

      })

      .catch(error => {

        logError('OPTIONS REPAS', error);

        if (active) {

          Alert.alert(

            'Options indisponibles',

            errorMessage(error),

          );

        }

      })

      .finally(() => {

        if (active) setLoading(false);

      });

    return () => {

      active = false;

    };

  }, []);

  const allOptions = Object.values(groups).flat();

  const selectedOptions = Object.values(selected)

    .flat()

    .map(id =>

      allOptions.find(

        option => Number(option.id) === Number(id),

      ),

    )

    .filter(Boolean);

  const estimatedTotal = selectedOptions.reduce(

    (sum, option) => sum + Number(option.price || 0),

    0,

  );

  function toggleOption(groupKey, option) {

    setSelected(current => {

      const previous = current[groupKey] || [];

      const exists = previous.some(

        id => Number(id) === Number(option.id),

      );

      return {

        ...current,

        [groupKey]: exists

          ? previous.filter(id => Number(id) !== Number(option.id))

          : [...previous, option.id],

      };

    });

  }

  async function placeCustomOrder() {

    if (busy) return;

    const optionIds = Object.values(selected).flat();

    if (optionIds.length === 0) {

      Alert.alert(

        'Composition vide',

        'Choisissez au moins une option.',

      );

      return;

    }

    setBusy(true);

    try {

      const me = await api('/api/auth/me');

      if (!me?.user) {

        throw new Error('Impossible de récupérer votre compte.');

      }

      const response = await api('/api/orders', {

        method: 'POST',

        body: JSON.stringify({

          customer_name: me.user.name,

          customer_phone: me.user.phone,

          notes,

          items: [

            {

              type: 'composition',

              option_ids: optionIds,

              quantity: 1,

            },

          ],

        }),

      });

      if (!response?.order) {

        throw new Error(

          'Le serveur n’a pas renvoyé la commande confirmée.',

        );

      }

      Alert.alert(

        'Commande confirmée',

        `Numéro : ${response.order.order_number}\nTotal : ${money(response.order.total)}`,

      );

      navigation.replace('Orders');

    } catch (error) {

      logError('COMMANDE PERSONNALISÉE', error);

      Alert.alert('Commande impossible', errorMessage(error));

    } finally {

      setBusy(false);

    }

  }

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView

        contentContainerStyle={styles.content}

        keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Compose ton repas</Text>

        <Text style={styles.description}>

          Choisissez les options. Le serveur calculera le prix final.

        </Text>

        {loading ? (

          <LoadingView text="Chargement des options…" />

        ) : (

          MEAL_GROUPS.map(group => (

            <View key={group.key} style={styles.optionGroup}>

              <Text style={styles.productName}>{group.label}</Text>

              {(groups[group.key] || []).length === 0 ? (

                <Text style={styles.description}>

                  Aucune option disponible.

                </Text>

              ) : (

                (groups[group.key] || []).map(option => {

                  const active = (

                    selected[group.key] || []

                  ).some(

                    id => Number(id) === Number(option.id),

                  );

                  return (

                    <TouchableOpacity

                      key={String(option.id)}

                      onPress={() => toggleOption(group.key, option)}

                      style={[

                        styles.optionRow,

                        active && styles.optionRowActive,

                      ]}>

                      <Text style={styles.optionName}>

                        {active ? '✓ ' : ''}

                        {option.name}

                      </Text>

                      <Text style={styles.price}>

                        {money(option.price)}

                      </Text>

                    </TouchableOpacity>

                  );

                })

              )}

            </View>

          ))

        )}

        <Field

          label="Instructions pour le restaurant (facultatif)"

          value={notes}

          onChangeText={setNotes}

          multiline

          maxLength={1000}

        />

        <View style={styles.totalCard}>

          <Text style={styles.description}>

            Estimation du prix

          </Text>

          <Text style={styles.total}>

            {money(estimatedTotal)}

          </Text>

          {selectedOptions.map((option, index) => (

            <Text

              key={`${option.id}-${index}`}

              style={styles.description}>

              • {option.name} — {money(option.price)}

            </Text>

          ))}

        </View>

        <Button

          title={busy ? 'Envoi de la commande…' : 'Confirmer ce repas'}

          onPress={placeCustomOrder}

          disabled={loading || busy || estimatedTotal <= 0}

        />

      </ScrollView>

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// ÉVALUATIONS

// ---------------------------------------------------------------------

function RateMealScreen({route, navigation}) {

  const product = route.params?.product || {};

  const [stars, setStars] = useState(5);

  const [comment, setComment] = useState('');

  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState(null);

  const [ratings, setRatings] = useState([]);

  const loadRatings = useCallback(async () => {

    if (!product.id) return;

    try {

      const data = await api(

        `/api/products/${product.id}/ratings`,

      );

      setSummary(data?.summary || null);

      setRatings(

        Array.isArray(data?.ratings) ? data.ratings : [],

      );

    } catch (error) {

      logError('CHARGEMENT ÉVALUATIONS', error);

    }

  }, [product.id]);

  useEffect(() => {

    loadRatings();

  }, [loadRatings]);

  async function submitRating() {

    if (busy) return;

    if (!product.id) {

      Alert.alert('Erreur', 'Identifiant du plat absent.');

      return;

    }

    setBusy(true);

    try {

      await api(`/api/products/${product.id}/ratings`, {

        method: 'POST',

        body: JSON.stringify({

          stars,

          comment: comment.trim(),

        }),

      });

      Alert.alert(

        'Merci !',

        'Votre évaluation a été enregistrée.',

      );

      navigation.goBack();

    } catch (error) {

      logError('ENREGISTREMENT ÉVALUATION', error);

      Alert.alert(

        'Évaluation impossible',

        errorMessage(error),

      );

    } finally {

      setBusy(false);

    }

  }

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView

        contentContainerStyle={styles.content}

        keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Évaluer le repas</Text>

        <Text style={styles.productName}>

          {product.name || 'Repas'}

        </Text>

        <Text style={styles.description}>

          {summary

            ? `${Number(summary.average_rating || 0).toFixed(1)} / 5 · ${summary.rating_count || 0} avis`

            : 'Aucune note disponible'}

        </Text>

        <View style={styles.starsRow}>

          {[1, 2, 3, 4, 5].map(value => (

            <TouchableOpacity

              key={value}

              onPress={() => setStars(value)}

              accessibilityRole="button"

              accessibilityLabel={`${value} étoiles`}>

              <Text

                style={[

                  styles.star,

                  {

                    color:

                      value <= stars ? '#F5A623' : '#C7C7CC',

                  },

                ]}>

                ★

              </Text>

            </TouchableOpacity>

          ))}

        </View>

        <Field

          label="Commentaire (facultatif)"

          value={comment}

          onChangeText={setComment}

          multiline

          maxLength={500}

          placeholder="Votre avis sur ce plat…"

        />

        <Button

          title={busy ? 'Enregistrement…' : 'Envoyer mon évaluation'}

          onPress={submitRating}

          disabled={busy}

        />

        <Text style={styles.sectionTitle}>Avis des clients</Text>

        {ratings.map((rating, index) => (

          <View

            key={`${rating.id || rating.created_at || 'rating'}-${index}`}

            style={styles.ratingCard}>

            <Text style={styles.ratingText}>

              {'★'.repeat(

                Math.max(0, Math.min(5, Number(rating.stars) || 0)),

              )}

              {'☆'.repeat(

                5 -

                  Math.max(

                    0,

                    Math.min(5, Number(rating.stars) || 0),

                  ),

              )}

            </Text>

            <Text style={styles.productName}>

              {rating.customer_name || 'Client'}

            </Text>

            {!!rating.comment && (

              <Text style={styles.description}>

                {rating.comment}

              </Text>

            )}

          </View>

        ))}

      </ScrollView>

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// PANIER ET COMMANDES

// ---------------------------------------------------------------------

function CartScreen({route, navigation}) {

  const {

    products = [],

    cart: initialCart = {},

    setCart: setMenuCart,

  } = route.params || {};

  const [cart, setCart] = useState({...initialCart});

  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState(false);

  const selected = products

    .filter(product => Number(cart[product.id] || 0) > 0)

    .map(product => ({

      ...product,

      quantity: Number(cart[product.id]),

    }));

  const total = selected.reduce(

    (sum, product) =>

      sum + Number(product.price || 0) * product.quantity,

    0,

  );

  function updateQuantity(productId, change) {

    const quantity = Math.max(

      0,

      Number(cart[productId] || 0) + change,

    );

    const updated = {...cart};

    if (quantity === 0) {

      delete updated[productId];

    } else {

      updated[productId] = quantity;

    }

    setCart(updated);

    if (typeof setMenuCart === 'function') {

      setMenuCart(updated);

    }

  }

  async function placeOrder() {

    if (busy) return;

    if (selected.length === 0) {

      Alert.alert('Panier vide', 'Ajoutez au moins un plat.');

      return;

    }

    setBusy(true);

    try {

      const me = await api('/api/auth/me');

      if (!me?.user) {

        throw new Error('Impossible de récupérer votre compte.');

      }

      const response = await api('/api/orders', {

        method: 'POST',

        body: JSON.stringify({

          customer_name: me.user.name,

          customer_phone: me.user.phone,

          notes,

          items: selected.map(product => ({

            product_id: product.id,

            quantity: product.quantity,

          })),

        }),

      });

      if (!response?.order) {

        throw new Error(

          'Le serveur n’a pas confirmé la commande.',

        );

      }

      setCart({});

      if (typeof setMenuCart === 'function') {

        setMenuCart({});

      }

      Alert.alert(

        'Commande confirmée',

        `Numéro : ${response.order.order_number}\nTotal : ${money(response.order.total)}`,

      );

      navigation.replace('Orders');

    } catch (error) {

      logError('COMMANDE PANIER', error);

      Alert.alert('Commande impossible', errorMessage(error));

    } finally {

      setBusy(false);

    }

  }

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView

        contentContainerStyle={styles.content}

        keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Votre panier</Text>

        {selected.map(product => (

          <View style={styles.cartRow} key={String(product.id)}>

            <View style={{flex: 1}}>

              <Text style={styles.productName}>

                {product.name}

              </Text>

              <Text style={styles.description}>

                {money(product.price)} × {product.quantity}

              </Text>

              <Text style={styles.price}>

                Sous-total :{' '}

                {money(

                  Number(product.price || 0) * product.quantity,

                )}

              </Text>

            </View>

            <View style={styles.quantity}>

              <Button

                title="−"

                secondary

                onPress={() => updateQuantity(product.id, -1)}

              />

              <Text style={styles.quantityText}>

                {product.quantity}

              </Text>

              <Button

                title="+"

                onPress={() => updateQuantity(product.id, 1)}

              />

            </View>

          </View>

        ))}

        {selected.length === 0 && (

          <Text style={styles.description}>

            Votre panier est vide.

          </Text>

        )}

        <Field

          label="Note pour le restaurant (facultatif)"

          value={notes}

          onChangeText={setNotes}

          multiline

          maxLength={1000}

        />

        <View style={styles.totalCard}>

          <Text style={styles.description}>

            Total estimé

          </Text>

          <Text style={styles.total}>{money(total)}</Text>

        </View>

        <Text style={styles.description}>

          Paiement en espèces lors du retrait au restaurant.

        </Text>

        <Button

          title={busy ? 'Envoi…' : 'Confirmer la commande'}

          onPress={placeOrder}

          disabled={busy || selected.length === 0}

        />

      </ScrollView>

    </SafeAreaView>

  );

}

function OrdersScreen() {

  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);

  const load = useCallback(async (showAlert = false) => {

    try {

      const data = await api('/api/orders/mine');

      setOrders(

        Array.isArray(data?.orders) ? data.orders : [],

      );

    } catch (error) {

      logError('COMMANDES', error);

      if (showAlert) {

        Alert.alert(

          'Commandes indisponibles',

          errorMessage(error),

        );

      }

    } finally {

      setLoading(false);

    }

  }, []);

  useEffect(() => {

    load(false);

    const timer = setInterval(() => {

      load(false);

    }, 20000);

    return () => clearInterval(timer);

  }, [load]);

  const labels = {

    pending: 'En attente de confirmation',

    accepted: 'Acceptée',

    preparing: 'En préparation',

    ready: 'PRÊTE — venez la récupérer !',

    picked_up: 'Récupérée / payée',

    cancelled: 'Annulée',

  };

  if (loading) {

    return (

      <SafeAreaView style={styles.screen}>

        <LoadingView text="Chargement des commandes…" />

      </SafeAreaView>

    );

  }

  return (

    <SafeAreaView style={styles.screen}>

      <View style={styles.topRow}>

        <Text style={styles.title}>Mes commandes</Text>

        <Button

          title="Actualiser"

          secondary

          onPress={() => load(true)}

        />

      </View>

      <FlatList

        data={orders}

        keyExtractor={order => String(order.id)}

        contentContainerStyle={styles.list}

        ListEmptyComponent={

          <Text style={styles.emptyOrders}>

            Aucune commande pour le moment.

          </Text>

        }

        renderItem={({item}) => (

          <View style={styles.orderCard}>

            <Text style={styles.productName}>

              {item.order_number}

            </Text>

            <Text

              style={[

                styles.status,

                item.status === 'ready' && styles.ready,

              ]}>

              {labels[item.status] || item.status}

            </Text>

            {(item.items || []).map((product, index) => (

              <View key={`${product.product_id || product.product_name}-${index}`}>

                <Text style={styles.description}>

                  {product.quantity} × {product.product_name} —{' '}

                  {money(product.line_total)}

                </Text>

                {(product.options || []).map((option, optionIndex) => (

                  <Text

                    key={`${option.option_id || option.option_name}-${optionIndex}`}

                    style={styles.optionDescription}>

                    • {option.option_name} —{' '}

                    {money(option.unit_price)}

                  </Text>

                ))}

              </View>

            ))}

            <Text style={styles.total}>

              {money(item.total)}

            </Text>

            <Text style={styles.description}>

              Paiement : espèces au retrait

            </Text>

          </View>

        )}

      />

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// COMPTE CLIENT

// ---------------------------------------------------------------------

function AccountScreen() {

  const auth = useContext(AuthContext);

  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);

  const loadUser = useCallback(async () => {

    try {

      const data = await api('/api/auth/me');

      if (!data?.user) {

        throw new Error('Le profil utilisateur est absent.');

      }

      setUser(data.user);

    } catch (error) {

      logError('PROFIL', error);

      Alert.alert('Profil indisponible', errorMessage(error));

    } finally {

      setLoading(false);

    }

  }, []);

  useEffect(() => {

    loadUser();

  }, [loadUser]);

  async function logout() {

    if (busy) return;

    setBusy(true);

    try {

      await clearToken();

      await auth.reload();

    } catch (error) {

      logError('DÉCONNEXION', error);

      Alert.alert('Déconnexion impossible', errorMessage(error));

    } finally {

      setBusy(false);

    }

  }

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView contentContainerStyle={styles.content}>

        <Text style={styles.title}>Mon compte</Text>

        {loading ? (

          <LoadingView text="Chargement du profil…" />

        ) : user ? (

          <View style={styles.profileCard}>

            <Text style={styles.profileName}>

              {user.name}

            </Text>

            <Text style={styles.description}>

              {user.email}

            </Text>

            <Text style={styles.description}>

              {user.phone}

            </Text>

          </View>

        ) : (

          <Text style={styles.description}>

            Les informations du compte ne sont pas disponibles.

          </Text>

        )}

        <Button

          title={busy ? 'Déconnexion…' : 'Se déconnecter'}

          secondary

          onPress={logout}

          disabled={busy}

        />

      </ScrollView>

    </SafeAreaView>

  );

}

// ---------------------------------------------------------------------

// NAVIGATION

// ---------------------------------------------------------------------

function MainNavigator() {

  const auth = useContext(AuthContext);

  if (auth.loading) {

    return (

      <View style={styles.center}>

        <ActivityIndicator size="large" color={COLORS.accent} />

      </View>

    );

  }

  return (

    <Stack.Navigator

      screenOptions={{

        headerTintColor: COLORS.primary,

        headerTitleStyle: {fontWeight: '700'},

        headerStyle: {backgroundColor: COLORS.background},

        headerShadowVisible: false,

        contentStyle: {backgroundColor: COLORS.background},

      }}>

      {!auth.loggedIn ? (

        <>

          <Stack.Screen

            name="Login"

            component={LoginScreen}

            options={{headerShown: false}}

          />

          <Stack.Screen

            name="Register"

            component={RegisterScreen}

            options={{title: 'Inscription'}}

          />

        </>

      ) : (

        <>

          <Stack.Screen

            name="Menu"

            component={MenuScreen}

            options={{headerShown: false}}

          />

          <Stack.Screen

            name="Cart"

            component={CartScreen}

            options={{title: 'Panier'}}

          />

          <Stack.Screen

            name="MealComposer"

            component={MealComposerScreen}

            options={{title: 'Composer mon repas'}}

          />

          <Stack.Screen

            name="RateMeal"

            component={RateMealScreen}

            options={{title: 'Évaluer un repas'}}

          />

          <Stack.Screen

            name="Orders"

            component={OrdersScreen}

            options={{title: 'Mes commandes'}}

          />

          <Stack.Screen

            name="Account"

            component={AccountScreen}

            options={{title: 'Mon compte'}}

          />

        </>

      )}

    </Stack.Navigator>

  );

}

// ---------------------------------------------------------------------

// TEST DIRECT DU TOKEN FCM — SANS API NI BASE DE DONNÉES

// ---------------------------------------------------------------------

async function testFCMToken() {
  console.log('[TEST FCM] Début');

  try {
    const messagingInstance = getMessaging();

    if (!messagingInstance) {
      throw new Error(
        'Firebase Messaging est indisponible. Vérifiez la configuration Firebase Android.',
      );
    }

    Alert.alert('TEST FCM', 'Vérification de la permission et récupération du token…');

    const registration = await preparePushRegistration();
    const token =
      registration?.token ||
      (await getFirebaseMessagingToken(messagingInstance));

    const installationId =
      registration?.installationId || (await getInstallationId());

    if (
      typeof token !== 'string' ||
      token.trim().length < 20 ||
      typeof installationId !== 'string' ||
      installationId.trim().length === 0
    ) {
      throw new Error(
        'Firebase n’a pas fourni un token FCM valide ou l’identifiant d’installation est absent.',
      );
    }

    console.log('[TEST FCM] Token obtenu. Longueur :', token.length);
    console.log('[TEST FCM] Installation ID :', installationId);

    Alert.alert(
      'TOKEN FCM OBTENU',
      `Token valide reçu (${token.length} caractères).\nInstallation : ${installationId}\n\nLe token complet n’est pas affiché pour éviter de l’exposer.`,
    );
  } catch (error) {
    console.error('[TEST FCM] Erreur complète :', error);

    Alert.alert(
      'ERREUR FCM',
      `Type : ${typeof error}\nNom : ${error?.name || 'inconnu'}\nCode : ${error?.code || 'inconnu'}\nMessage : ${error?.message || String(error)}`,
    );
  }
}

// ---------------------------------------------------------------------

// APPLICATION ET SESSION

// ---------------------------------------------------------------------

export default function App() {

  const [loggedIn, setLoggedIn] = useState(false);

  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {

    setLoading(true);

    try {

      const token = await getToken();

      if (!token) {

        setLoggedIn(false);

        return false;

      }

      const response = await api('/api/auth/me');

      if (!response?.user) {

        throw new Error(

          'La route /api/auth/me n’a pas renvoyé de compte utilisateur.',

        );

      }

      setLoggedIn(true);

      return true;

    } catch (error) {

      logError('VALIDATION SESSION', error);

      setLoggedIn(false);

      try {

        await clearToken();

      } catch (storageError) {

        logError('SUPPRESSION TOKEN INVALIDE', storageError);

      }

      return false;

    } finally {

      setLoading(false);

    }

  }, []);

  useEffect(() => {

    reload().catch(error => {

      logError('DÉMARRAGE APPLICATION', error);

      setLoggedIn(false);

      setLoading(false);

    });

  }, [reload]);

    useEffect(() => {

    if (!loggedIn) return undefined;

    let mounted = true;

    let unsubscribe = null;

    let unsubscribeTokenRefresh = null;

    async function setupNotifications() {

      try {

        /*

         * Les notifications sont facultatives pour afficher le menu.

         * Une erreur FCM ne doit pas fermer la session client.

         */

        await registerPushNotifications();

        if (!mounted) return;

        // Synchroniser aussi le token actuel à chaque connexion.
        // Cela répare les comptes déjà existants dont le token n'est pas en base.
        try {
          const currentRegistration = await preparePushRegistration();
          const currentToken =
            typeof currentRegistration?.token === 'string'
              ? currentRegistration.token.trim()
              : '';
          const installationId =
            typeof currentRegistration?.installationId === 'string'
              ? currentRegistration.installationId.trim()
              : '';

          if (currentToken.length >= 20 && installationId) {
            const result = await api('/api/auth/fcm-token', {
              method: 'POST',
              body: JSON.stringify({
                token: currentToken,
                installationId,
                platform: Platform.OS,
                deviceLabel: `${Platform.OS} FastFood One`,
              }),
            });

            if (result?.ok !== true) {
              throw new Error(
                result?.message ||
                  result?.error ||
                  'Le serveur n’a pas confirmé la synchronisation du token FCM.',
              );
            }

            console.log('[FCM] Token actuel synchronisé avec le serveur.');
          } else {
            console.warn('[FCM] Token actuel ou installation ID indisponible.');
          }
        } catch (syncError) {
          logError('SYNCHRONISATION FCM À LA CONNEXION', syncError);
        }

        // Écoute du rafraîchissement automatique du token FCM.

        unsubscribeTokenRefresh = onTokenRefresh(

  getMessaging(),

  async newToken => {

            try {

              const installationId = await getInstallationId();

              const result = await api('/api/auth/fcm-token', {

                method: 'POST',

                body: JSON.stringify({

                  token: newToken,

                  installationId,

                  platform: Platform.OS,

                  deviceLabel: `${Platform.OS} FastFood One`,

                }),

              });

              if (result?.ok !== true) {

                console.warn(

                  '[FCM] Le serveur n’a pas confirmé le rafraîchissement du token.',

                );

              } else {

                console.log('[FCM] Token rafraîchi et enregistré.');

              }

            } catch (e) {

              console.warn(

                '[FCM] Rafraîchissement token:',

                e?.message || e,

              );

            }

          },

        );

        const stop = listenForPush(message => {

          const title =

            message?.notification?.title ||

            'Mise à jour de commande';

          const body =

            message?.notification?.body ||

            'Consultez vos commandes.';

          Alert.alert(title, body);

        });

        if (typeof stop === 'function') {

          unsubscribe = stop;

        }

      } catch (error) {

        logError('NOTIFICATIONS', error);

      }

    }

    setupNotifications();

    return () => {

      mounted = false;

      if (typeof unsubscribe === 'function') {

        try {

          unsubscribe();

        } catch (error) {

          logError('ARRÊT NOTIFICATIONS', error);

        }

      }

      // ✅ Nettoyage de l'écoute du refresh token.

      if (typeof unsubscribeTokenRefresh === 'function') {

        try {

          unsubscribeTokenRefresh();

        } catch (error) {

          logError('ARRÊT RAFRAÎCHISSEMENT TOKEN', error);

        }

      }

    };

  }, [loggedIn]);

  return (

    <AuthContext.Provider value={{loggedIn, loading, reload}}>

      <NavigationContainer>

        <StatusBar barStyle="dark-content" />

        <MainNavigator />

      </NavigationContainer>

    </AuthContext.Provider>

  );

}

// ---------------------------------------------------------------------

// STYLES

// ---------------------------------------------------------------------

const styles = StyleSheet.create({

  screen: {

    flex: 1,

    backgroundColor: COLORS.background,

  },

  content: {

    padding: 20,

    paddingBottom: 35,

    gap: 12,

  },

  center: {

    flex: 1,

    justifyContent: 'center',

    alignItems: 'center',

    backgroundColor: COLORS.background,

  },

  loadingContainer: {

    padding: 25,

    alignItems: 'center',

    justifyContent: 'center',

    gap: 12,

  },

  logo: {

    fontSize: 32,

    fontWeight: '900',

    color: COLORS.primary,

    marginTop: 30,

    textAlign: 'center',

  },

  subtitle: {

    fontSize: 16,

    color: COLORS.textGray,

    marginBottom: 20,

    textAlign: 'center',

  },

  title: {

    fontSize: 26,

    fontWeight: '800',

    color: COLORS.primary,

  },

  greetingText: {

    fontSize: 16,

    color: COLORS.textGray,

    fontWeight: '500',

    marginBottom: 2,

  },

  topRow: {

    paddingHorizontal: 20,

    paddingTop: 20,

    paddingBottom: 8,

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    gap: 10,

  },

  cartButton: {

    width: 50,

    height: 50,

    borderRadius: 25,

    backgroundColor: COLORS.card,

    justifyContent: 'center',

    alignItems: 'center',

    elevation: 4,

  },

  cartIcon: {

    fontSize: 22,

  },

  cartBadge: {

    position: 'absolute',

    top: 2,

    right: 2,

    backgroundColor: COLORS.accent,

    borderRadius: 10,

    minWidth: 19,

    height: 19,

    paddingHorizontal: 4,

    justifyContent: 'center',

    alignItems: 'center',

  },

  cartBadgeText: {

    color: '#FFFFFF',

    fontSize: 10,

    fontWeight: 'bold',

  },

  searchBar: {

    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor: COLORS.card,

    borderRadius: 20,

    marginHorizontal: 20,

    marginTop: 12,

    paddingHorizontal: 15,

    paddingVertical: 8,

    elevation: 2,

  },

  searchIcon: {

    fontSize: 18,

    marginRight: 10,

  },

  searchInput: {

    flex: 1,

    fontSize: 15,

    color: COLORS.primary,

    paddingVertical: 8,

  },

  clearSearchButton: {

    width: 32,

    height: 32,

    borderRadius: 16,

    backgroundColor: '#E8E8EE',

    alignItems: 'center',

    justifyContent: 'center',

    marginLeft: 8,

  },

  clearSearchText: {

    fontSize: 16,

    fontWeight: '700',

    color: COLORS.primary,

  },

  filtersScroll: {

    flexGrow: 0,

    flexShrink: 0,

    marginTop: 12,

    maxHeight: 55,

  },

  filterRow: {

    flexDirection: 'row',

    paddingHorizontal: 20,

    gap: 8,

    alignItems: 'center',

  },

  filterBtn: {

    paddingVertical: 10,

    paddingHorizontal: 16,

    borderRadius: 20,

    backgroundColor: '#FFFFFF',

  },

  activeFilter: {

    backgroundColor: COLORS.primary,

  },

  filterText: {

    color: COLORS.textGray,

    fontWeight: '600',

    fontSize: 13,

  },

  activeFilterText: {

    color: '#FFFFFF',

  },

  sectionHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    marginHorizontal: 20,

    marginTop: 15,

  },

  sectionTitle: {

    fontSize: 18,

    fontWeight: '700',

    color: COLORS.primary,

    marginTop: 20,

    marginBottom: 12,

  },

  horizontalList: {

    paddingLeft: 20,

    paddingRight: 10,

    paddingBottom: 15,

  },

  productCard: {

    width: 205,

    backgroundColor: COLORS.card,

    borderRadius: 22,

    marginRight: 14,

    padding: 12,

    elevation: 4,

  },

  imageContainer: {

    alignItems: 'center',

    marginBottom: 10,

  },

  productImage: {

    width: 130,

    height: 130,

    borderRadius: 18,

    backgroundColor: '#F8F9FA',

  },

  imagePlaceholder: {

    width: 130,

    height: 130,

    borderRadius: 18,

    backgroundColor: '#F8F9FA',

    alignItems: 'center',

    justifyContent: 'center',

  },

  cardContent: {

    paddingHorizontal: 3,

  },

  productName: {

    fontSize: 16,

    fontWeight: '800',

    color: COLORS.primary,

    marginBottom: 5,

  },

  description: {

    fontSize: 13,

    lineHeight: 19,

    color: COLORS.textGray,

    marginBottom: 8,

  },

  price: {

    fontSize: 16,

    fontWeight: '800',

    color: '#C47C00',

    marginVertical: 4,

  },

  ratingText: {

    color: '#E6A000',

    fontSize: 13,

    marginVertical: 5,

  },

  linkText: {

    color: '#8A5A00',

    fontSize: 13,

    fontWeight: '700',

    paddingVertical: 5,

  },

  bottomNav: {

    paddingHorizontal: 20,

    marginTop: 15,

    gap: 8,

  },

  navBtn: {

    width: '100%',

  },

  field: {

    marginVertical: 6,

  },

  label: {

    fontWeight: '700',

    marginBottom: 6,

    color: COLORS.primary,

    fontSize: 14,

  },

  input: {

    backgroundColor: COLORS.card,

    borderRadius: 15,

    paddingHorizontal: 15,

    paddingVertical: 13,

    color: COLORS.primary,

    elevation: 1,

    fontSize: 15,

  },

  multilineInput: {

    minHeight: 95,

    textAlignVertical: 'top',

  },

  button: {

    paddingHorizontal: 18,

    paddingVertical: 14,

    borderRadius: 14,

    alignItems: 'center',

    justifyContent: 'center',

    marginVertical: 5,

  },

  primaryButton: {

    backgroundColor: COLORS.primary,

  },

  secondaryButton: {

    backgroundColor: '#FFFFFF',

    borderWidth: 1,

    borderColor: '#E0E0E0',

  },

  disabledButton: {

    opacity: 0.5,

  },

  buttonText: {

    color: '#FFFFFF',

    fontWeight: '700',

    fontSize: 15,

    textAlign: 'center',

  },

  optionGroup: {

    backgroundColor: COLORS.card,

    borderRadius: 16,

    padding: 14,

    marginBottom: 12,

  },

  optionRow: {

    padding: 12,

    marginTop: 7,

    borderRadius: 12,

    borderWidth: 1,

    borderColor: '#E0E0E0',

    backgroundColor: '#FFFFFF',

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    gap: 10,

  },

  optionRowActive: {

    borderColor: COLORS.accent,

    backgroundColor: '#FFF4DB',

  },

  optionName: {

    flex: 1,

    color: COLORS.primary,

    fontWeight: '600',

  },

  totalCard: {

    backgroundColor: COLORS.card,

    borderRadius: 16,

    padding: 18,

    marginVertical: 10,

  },

  total: {

    fontSize: 21,

    fontWeight: '900',

    marginTop: 8,

    color: COLORS.primary,

  },

  starsRow: {

    flexDirection: 'row',

    justifyContent: 'center',

    marginVertical: 20,

  },

  star: {

    fontSize: 38,

    marginHorizontal: 4,

  },

  ratingCard: {

    backgroundColor: COLORS.card,

    borderRadius: 12,

    padding: 12,

    marginBottom: 8,

  },

  cartRow: {

    paddingVertical: 15,

    borderBottomWidth: 1,

    borderColor: '#E0E0E0',

    flexDirection: 'row',

    alignItems: 'center',

    gap: 8,

  },

  quantity: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 4,

  },

  quantityText: {

    minWidth: 24,

    textAlign: 'center',

    color: COLORS.primary,

    fontSize: 16,

    fontWeight: '800',

  },

  list: {

    padding: 20,

    paddingBottom: 35,

  },

  orderCard: {

    backgroundColor: COLORS.card,

    padding: 18,

    borderRadius: 18,

    marginBottom: 15,

    elevation: 2,

  },

  status: {

    fontWeight: '800',

    color: '#B36A00',

    marginVertical: 6,

    fontSize: 14,

  },

  ready: {

    color: COLORS.success,

    fontSize: 16,

  },

  optionDescription: {

    color: COLORS.textGray,

    fontSize: 12,

    marginLeft: 12,

    marginTop: 4,

  },

  emptySearch: {

    width: Math.min(Dimensions.get('window').width - 40, 340),

    alignSelf: 'center',

    alignItems: 'center',

    justifyContent: 'center',

    paddingHorizontal: 20,

    paddingVertical: 35,

    backgroundColor: COLORS.card,

    borderRadius: 20,

    marginHorizontal: 20,

    marginTop: 20,

  },

  emptySearchIcon: {

    fontSize: 36,

    marginBottom: 12,

  },

  emptySearchTitle: {

    fontSize: 18,

    fontWeight: '800',

    color: COLORS.primary,

    textAlign: 'center',

    marginBottom: 8,

  },

  emptySearchText: {

    fontSize: 14,

    lineHeight: 21,

    color: COLORS.textGray,

    textAlign: 'center',

  },

  emptyOrders: {

    textAlign: 'center',

    marginTop: 25,

    color: COLORS.textGray,

  },

  profileCard: {

    backgroundColor: COLORS.card,

    padding: 20,

    borderRadius: 20,

    marginVertical: 15,

    gap: 6,

  },

  profileName: {

    fontSize: 20,

    fontWeight: '800',

    color: COLORS.primary,

  },

});
