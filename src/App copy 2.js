import React, {useEffect, useState, useCallback, createContext, useContext} from 'react';
import {ActivityIndicator, Alert, FlatList, Image, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {api, saveToken, clearToken, getToken} from './api';
import {registerPushNotifications, listenForPush} from './notifications';

const Stack = createNativeStackNavigator();
const AuthContext = createContext(null);
const DEBUG_APP = __DEV__;

// --- COULEURS DU DESIGN ---
const COLORS = {
  background: '#E8EAF6', // Bleu très clair
  card: '#FFFFFF',
  primary: '#1A1A1A', // Noir profond
  accent: '#FFA500', // Orange
  textGray: '#8E8E93',
  inputBg: '#F5F6FA',
};

function errorToText(error) {
  if (error == null) return 'Erreur inconnue';
  if (typeof error === 'string') return error;
  if (error.message) return String(error.message);
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function debugLog(etape, details = '') {
  const message =
    `[FASTFOOD DEBUG] ${new Date().toISOString()} | ${etape}` +
    (details ? ` | ${details}` : '');
  console.log(message);
}

function debugError(etape, error, afficherAlerte = true) {
  const message = errorToText(error);
  const stack = error?.stack ? String(error.stack) : '';

  console.error(
    `[FASTFOOD ERREUR] ${new Date().toISOString()} | ${etape} | ${message}`,
    stack
  );

  if (DEBUG_APP && afficherAlerte) {
    Alert.alert(`Erreur : ${etape}`, message.slice(0, 1500), [
      { text: 'OK' },
    ]);
  }
}

const money = n => new Intl.NumberFormat('fr-FR', {style:'currency', currency:'GBP'}).format(Number(n || 0));

// --- COMPOSANTS UI DE BASE (adaptés au design) ---
function Button({title, onPress, secondary, disabled, style}) {
  return (
    <TouchableOpacity 
      disabled={disabled} 
      onPress={onPress} 
      style={[
        styles.button, 
        secondary ? styles.secondary : styles.primaryButton, 
        disabled && {opacity:0.5},
        style
      ]}
    >
      <Text style={[styles.buttonText, secondary && {color: COLORS.primary}]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({label, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput 
        style={styles.input} 
        value={value} 
        onChangeText={onChangeText} 
        secureTextEntry={secureTextEntry} 
        keyboardType={keyboardType} 
        autoCapitalize={autoCapitalize || 'sentences'} 
        placeholderTextColor={COLORS.textGray}
      />
    </View>
  );
}

// --- ECRANS ---

function LoginScreen({navigation, route}) {
  const auth = useContext(AuthContext);
  const [email,setEmail] = useState(route?.params?.email || ''); const [password,setPassword] = useState(''); const [busy,setBusy] = useState(false);
  
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) {
      Alert.alert('Champs requis', 'Saisissez votre e-mail et votre mot de passe.');
      return;
    }

    setBusy(true);
    debugLog('CONNEXION', 'Début');
    try {
      const d = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!d?.token) {
        throw new Error('Le serveur n’a pas renvoyé de jeton de connexion.');
      }

      debugLog('CONNEXION', 'Réponse API reçue, sauvegarde du jeton');
      await saveToken(d.token);
      debugLog('CONNEXION', 'Rechargement de la session');
      await auth.reload();
      debugLog('CONNEXION', 'Traitement terminé');
    } catch (error) {
      debugError('CONNEXION', error);
    } finally {
      setBusy(false);
    }
  }
  
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>FastFood One</Text>
        <Text style={styles.subtitle}>Commandez. Récupérez. Savourez.</Text>
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
        <Button title={busy?'Connexion…':'Se connecter'} onPress={submit} disabled={busy}/>
        <Button title="Créer un compte" secondary onPress={()=>navigation.navigate('Register')}/>
      </ScrollView>
    </SafeAreaView>
  );
}

function RegisterScreen({navigation}) {
  const [name,setName] = useState(''); const [email,setEmail] = useState(''); const [phone,setPhone] = useState(''); const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  
  async function submit() {
    if (busy) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!cleanName || !cleanEmail || !password) {
      Alert.alert('Champs requis', 'Remplissez le nom, l’e-mail et le mot de passe.');
      return;
    }
    if (password.length < 10) {
      Alert.alert('Mot de passe invalide', 'Utilisez au moins 10 caractères.');
      return;
    }

    setBusy(true);
    debugLog('INSCRIPTION', 'Début');

    try {
      debugLog('INSCRIPTION', 'Envoi de la requête API');
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          password,
        }),
      });

      debugLog('INSCRIPTION', 'Compte créé avec succès');
      Alert.alert(
        'Inscription réussie',
        'Votre compte a été créé. Vous pouvez maintenant vous connecter avec votre e-mail et votre mot de passe.',
        [{
          text: 'Aller à la connexion',
          onPress: () => navigation.navigate('Login', { email: cleanEmail }),
        }],
        { cancelable: false }
      );
    } catch (error) {
      debugError('INSCRIPTION', error);
    } finally {
      debugLog('INSCRIPTION', 'Fin du chargement');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Créer un compte</Text>
        <Field label="Nom complet" value={name} onChangeText={setName}/>
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
        <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
        <Field label="Mot de passe (10 caractères minimum)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
        <Button title={busy?'Création…':'Créer mon compte'} onPress={submit} disabled={busy}/>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- ECRAN MENU AVEC LE NOUVEAU DESIGN ---
function MenuScreen({navigation}) {
  const [products,setProducts] = useState([]); 
  const [cart,setCart] = useState({}); 
  const [loading,setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState('Tous');

  const load = useCallback(async (showAlert = false) => {
    debugLog('MENU', 'Chargement des produits');
    try {
      const d = await api('/api/products');
      if (!Array.isArray(d?.products)) {
        throw new Error('Réponse inattendue du serveur : la liste products est absente.');
      }
      setProducts(d.products);
      debugLog('MENU', `Chargement réussi : ${d.products.length} produit(s)`);
    } catch (error) {
      debugError('MENU / API PRODUITS', error, showAlert);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(false), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const count = Object.values(cart).reduce((a,b)=>a+b,0);

  // Filtrage basique pour l'UI (ne casse pas ta logique de produits, c'est juste visuel)
  

  // Normalisation : minuscules, accents et espaces superflus.
  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Catégories et variantes acceptées par l'application.
  const categoryGroups = {
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

  function matchesCategory(productCategory, selectedCategory) {
    if (selectedCategory === 'Tous') {
      return true;
    }

    const category = normalizeText(productCategory);
    const acceptedCategories = categoryGroups[selectedCategory] || [];

    return acceptedCategories.some(
      accepted => normalizeText(accepted) === category
    );
  }

  // Recherche dans le nom, la description et la catégorie.
  const query = normalizeText(searchText);

  const filteredProducts = products.filter(product => {
    const searchableText = normalizeText([
      product.name,
      product.description,
      product.category,
    ].filter(Boolean).join(' '));

    // Chaque mot saisi doit être retrouvé dans les informations du produit.
    const searchWords = query.split(' ').filter(Boolean);

    const matchesSearch = searchWords.every(word =>
      searchableText.includes(word)
    );

    // Lorsque le client recherche un terme, la recherche porte sur
    // toutes les catégories, même si un filtre était précédemment actif.
    const matchesSelectedCategory =
      query.length > 0 ||
      activeFilter === 'Tous' ||
      matchesCategory(product.category, activeFilter);

    return matchesSearch && matchesSelectedCategory;
  });



  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header avec panier */}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.greetingText}>What makes the</Text>
          <Text style={styles.title}>perfect pizza?</Text>
        </View>
        <TouchableOpacity style={styles.cartButton} onPress={()=>navigation.navigate('Cart',{cart,products,setCart})}>
          <Text style={styles.cartIcon}>🛒</Text>
          {count > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{count}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Barre de recherche */}
      
  {/* Barre de recherche améliorée */}
  <View style={styles.searchBar}>
    <Text style={styles.searchIcon}>🔍</Text>

    <TextInput
      placeholder="Rechercher un plat, une viande, une boisson..."
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
        style={styles.clearSearchButton}
        accessibilityRole="button"
        accessibilityLabel="Effacer la recherche"
      >
        <Text style={styles.clearSearchText}>✕</Text>
      </TouchableOpacity>
    )}
  </View>


      {/* Filtres (Visuel uniquement pour l'instant) */}
      <ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  style={{ flexGrow: 0, marginTop: 20 }}
  contentContainerStyle={styles.filterRow}
>
        
{[
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
].map((filter) => (
  <TouchableOpacity
    key={filter}
    style={[
      styles.filterBtn,
      activeFilter === filter && styles.activeFilter,
    ]}
    onPress={() => setActiveFilter(filter)}
  >
    <Text
      style={[
        styles.filterText,
        activeFilter === filter && styles.activeFilterText,
      ]}
    >
      {{
  Tous: 'Tous',
  Drink: 'Boissons',
  Legumes: 'Légumes',
  Chevres: 'Chèvres',
  Poulet: 'Poulet',
  Vaches: 'Vaches',
  Porcs: 'Porcs',
  Poissons: 'Poissons',
  Lapins: 'Lapins',
  Dindons: 'Dindons',
  Gibiers: 'Gibiers',
}[filter] || filter}
    </Text>
  </TouchableOpacity>
))}

      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={{marginTop: 50}}/>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 100}}>
          
          <Text style={styles.sectionTitle}>Top of the week</Text>
          
          {/* Liste Horizontale de style "Cards" */}
          <FlatList 
            data={filteredProducts} 
            keyExtractor={p=>String(p.id)} 
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            ListEmptyComponent={
  <View style={styles.emptySearch}>
    <Text style={styles.emptySearchIcon}>🔎</Text>
    <Text style={styles.emptySearchTitle}>
      {searchText.trim()
        ? 'Aucun résultat trouvé'
        : 'Aucun produit disponible'}
    </Text>
    <Text style={styles.emptySearchText}>
      {searchText.trim()
        ? 'Essayez un autre nom ou effacez votre recherche.'
        : 'Cette catégorie ne contient pas encore de produits.'}
    </Text>

    {searchText.trim().length > 0 && (
      <Button
        title="Effacer la recherche"
        secondary
        onPress={() => setSearchText('')}
      />
    )}
  </View>
}
            renderItem={({item})=>(
              <View style={styles.productCard}>
                {/* Image de la pizza */}
                <View style={styles.imageContainer}>
                  {item.image_url ? (
                    <Image source={{uri:item.image_url}} style={styles.productImage}/>
                  ) : (
                    <View style={styles.imagePlaceholder}><Text style={{fontSize:50}}>🍕</Text></View>
                  )}
                </View>
                
                {/* Infos Produit */}
                <View style={styles.cardContent}>
                  <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.description} numberOfLines={1}>{item.description || item.category}</Text>
                  <Text style={styles.price}>{money(item.price)}</Text>
                  <Text style={{color:'#E6A000',fontSize:12,marginTop:3}}>
                    ★ {Number(item.average_rating || 0).toFixed(1)} ({Number(item.rating_count || 0)})
                  </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('RateMeal', {product:item})} style={{marginTop:5}}>
                    <Text style={{color:COLORS.primary,fontSize:11,fontWeight:'700'}}>Évaluer ★</Text>
                  </TouchableOpacity>
                </View>

                {/* Bouton + flottant */}
                <TouchableOpacity 
                  style={styles.addButtonFloat} 
                  onPress={()=>setCart(c=>({...c,[item.id]:(c[item.id]||0)+1}))}
                >
                  <Text style={styles.addText}>+</Text>
                </TouchableOpacity>
              </View>
            )}
          />

          {/* Section boutons de navigation (conservés de ton code) */}
          <View style={styles.bottomNav}>
            <Button title="Composer un repas" secondary onPress={()=>navigation.navigate('MealComposer')} style={styles.navBtn}/>
            <Button title="Mes commandes" secondary onPress={()=>navigation.navigate('Orders')} style={styles.navBtn}/>
            <Button title="Mon compte" secondary onPress={()=>navigation.navigate('Account')} style={styles.navBtn}/>
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// --- AUTRES ECRANS (gardés tels quels ou légèrement stylisés) ---


const MEAL_GROUPS = [
  {key:'base', label:'Base', required:true},
  {key:'viande', label:'Viande', required:true},
  {key:'accompagnement', label:'Accompagnement', required:true},
  {key:'legumes', label:'Légumes', required:false},
  {key:'boisson', label:'Boisson', required:true},
  {key:'supplements', label:'Suppléments', required:false},
];

function MealComposerScreen({navigation}) {
  const [groups, setGroups] = useState({});
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api('/api/meal-options')
      .then(data => setGroups(data?.groups || {}))
      .catch(error => Alert.alert('Options indisponibles', error?.message || 'Impossible de charger les options.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedOptions = Object.values(selected).flat().map(id =>
    Object.values(groups).flat().find(option => Number(option.id) === Number(id))
  ).filter(Boolean);
  const total = selectedOptions.reduce((sum, option) => sum + Number(option.price || 0), 0);

  function toggleOption(group, option) {
    setSelected(current => {
      const old = current[group] || [];
      const isRequired = ['base','viande','accompagnement','boisson'].includes(group);
      if (isRequired) return {...current, [group]: [option.id]};
      return {...current, [group]: old.some(id => Number(id) === Number(option.id))
        ? old.filter(id => Number(id) !== Number(option.id))
        : [...old, option.id]};
    });
  }

  async function placeCustomOrder() {
    if (busy) return;
    const required = ['base','viande','accompagnement','boisson'];
    if (required.some(group => (selected[group] || []).length !== 1)) {
      Alert.alert('Composition incomplète', 'Choisissez une base, une viande, un accompagnement et une boisson.');
      return;
    }
    const optionIds = Object.values(selected).flat();
    if (!optionIds.length) return;
    setBusy(true);
    try {
      const me = await api('/api/auth/me');
      if (!me?.user) throw new Error('Impossible de récupérer votre compte.');
      const response = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: me.user.name,
          customer_phone: me.user.phone,
          notes,
          items: [{type:'composition', option_ids: optionIds, quantity:1}],
        }),
      });
      Alert.alert('Commande confirmée', `Numéro : ${response.order.order_number}\nTotal confirmé : ${money(response.order.total)}`);
      navigation.replace('Orders');
    } catch (error) {
      Alert.alert('Commande impossible', error?.message || 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Compose ton repas</Text>
        <Text style={styles.description}>Choisissez les ingrédients. Le prix est recalculé automatiquement.</Text>
        {loading ? <ActivityIndicator size="large" color={COLORS.accent} /> : MEAL_GROUPS.map(group => (
          <View key={group.key} style={{backgroundColor:COLORS.card,borderRadius:16,padding:14,marginBottom:12}}>
            <Text style={styles.productName}>{group.label}{group.required ? ' *' : ' (facultatif)'}</Text>
            {(groups[group.key] || []).length === 0 ? (
              <Text style={styles.description}>Aucune option disponible pour le moment.</Text>
            ) : (groups[group.key] || []).map(option => {
              const active = (selected[group.key] || []).some(id => Number(id) === Number(option.id));
              return (
                <TouchableOpacity key={String(option.id)} onPress={() => toggleOption(group.key, option)}
                  style={{padding:12,marginTop:7,borderRadius:12,borderWidth:1,borderColor:active ? COLORS.accent : '#E0E0E0',backgroundColor:active ? '#FFF4DB' : '#FFFFFF',flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
                  <Text style={{flex:1,color:COLORS.primary,fontWeight:active?'800':'500'}}>{active ? '✓ ' : ''}{option.name}</Text>
                  <Text style={{color:COLORS.accent,fontWeight:'800'}}>{money(option.price)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <Field label="Instructions pour le restaurant (facultatif)" value={notes} onChangeText={setNotes} />
        <View style={{backgroundColor:COLORS.card,borderRadius:16,padding:18,marginVertical:10}}>
          <Text style={styles.description}>Prix estimé du repas</Text>
          <Text style={styles.total}>{money(total)}</Text>
          {selectedOptions.map(option => <Text key={String(option.id)} style={styles.description}>• {option.name} — {money(option.price)}</Text>)}
        </View>
        <Button title={busy ? 'Envoi de la commande…' : 'Confirmer ce repas'} onPress={placeCustomOrder} disabled={loading || busy || total <= 0} />
      </ScrollView>
    </SafeAreaView>
  );
}

function RateMealScreen({route, navigation}) {
  const product = route.params?.product || {};
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [ratings, setRatings] = useState([]);

  const loadRatings = useCallback(async () => {
    try {
      const data = await api(`/api/products/${product.id}/ratings`);
      setSummary(data?.summary || null);
      setRatings(Array.isArray(data?.ratings) ? data.ratings : []);
    } catch (error) {
      debugError('ÉVALUATIONS', error, false);
    }
  }, [product.id]);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  async function submitRating() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/products/${product.id}/ratings`, {
        method:'POST',
        body:JSON.stringify({stars, comment:comment.trim()}),
      });
      Alert.alert('Merci !', 'Votre évaluation a été enregistrée.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Évaluation impossible', error?.message || 'Vous devez avoir récupéré ce plat avant de le noter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Évaluer le repas</Text>
        <Text style={styles.productName}>{product.name || 'Repas'}</Text>
        <Text style={styles.description}>{summary ? `${Number(summary.average_rating).toFixed(1)} / 5 · ${summary.rating_count} avis` : 'Aucune note pour le moment'}</Text>
        <View style={{flexDirection:'row',justifyContent:'center',marginVertical:20}}>
          {[1,2,3,4,5].map(value => (
            <TouchableOpacity key={value} onPress={() => setStars(value)} accessibilityLabel={`${value} étoiles`}>
              <Text style={{fontSize:38,color:value <= stars ? '#F5A623' : '#C7C7CC',marginHorizontal:4}}>★</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Commentaire (facultatif)</Text>
        <TextInput value={comment} onChangeText={setComment} maxLength={500} multiline
          placeholder="Qu’avez-vous pensé de ce plat ?" placeholderTextColor={COLORS.textGray}
          style={[styles.input,{minHeight:100,textAlignVertical:'top'}]} />
        <Button title={busy ? 'Enregistrement…' : 'Envoyer mon évaluation'} onPress={submitRating} disabled={busy} />
        <Text style={[styles.sectionTitle,{marginLeft:0}]}>Avis des clients</Text>
        {ratings.map((rating,index) => (
          <View key={`${rating.created_at}-${index}`} style={{backgroundColor:COLORS.card,borderRadius:12,padding:12,marginBottom:8}}>
            <Text style={{color:'#F5A623',fontSize:18}}>{'★'.repeat(Number(rating.stars))}{'☆'.repeat(5-Number(rating.stars))}</Text>
            <Text style={styles.productName}>{rating.customer_name}</Text>
            {!!rating.comment && <Text style={styles.description}>{rating.comment}</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function CartScreen({ route, navigation }) {
  const { products = [], cart: initialCart = {}, setCart: setMenuCart } = route.params;

  // Panier local : actualisation immédiate de l'écran
  const [cart, setCart] = useState({ ...initialCart });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  // Produits et quantités sélectionnés
  const selected = products
    .filter(product => (cart[product.id] || 0) > 0)
    .map(product => ({
      ...product,
      quantity: cart[product.id],
    }));

  // Recalcul automatique du total à chaque modification du panier
  const total = selected.reduce(
    (sum, product) => sum + Number(product.price || 0) * product.quantity,
    0
  );

  // Modifie la quantité immédiatement dans le panier
  function updateQuantity(productId, change) {
    const currentQuantity = cart[productId] || 0;
    const newQuantity = Math.max(0, currentQuantity + change);

    const updatedCart = { ...cart };

    if (newQuantity === 0) {
      delete updatedCart[productId];
    } else {
      updatedCart[productId] = newQuantity;
    }

    // Actualisation immédiate de la page Panier
    setCart(updatedCart);

    // Synchronisation avec le panier du menu
    if (typeof setMenuCart === 'function') {
      setMenuCart(updatedCart);
    }
  }

  async function placeOrder() {
    if (busy || selected.length === 0) return;

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

      // Vide le panier uniquement après confirmation du serveur
      setCart({});
      if (typeof setMenuCart === 'function') {
        setMenuCart({});
      }

      Alert.alert(
        'Commande confirmée',
        `Votre numéro : ${response.order.order_number}`
      );

      navigation.replace('Orders');
    } catch (error) {
      Alert.alert(
        'Commande impossible',
        error?.message || 'Une erreur est survenue.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Votre panier</Text>

        {selected.map(product => (
          <View style={styles.cartRow} key={product.id}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>
                {product.name}
              </Text>

              <Text style={{ color: COLORS.textGray }}>
                {money(product.price)} × {product.quantity}
              </Text>

              <Text style={styles.price}>
                Sous-total : {money(Number(product.price || 0) * product.quantity)}
              </Text>
            </View>

            <View style={styles.quantity}>
              <Button
                title="−"
                secondary
                onPress={() => updateQuantity(product.id, -1)}
              />

              <View style={{
                minWidth: 30,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Text style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: COLORS.primary,
                }}>
                  {product.quantity}
                </Text>
              </View>

              <Button
                title="+"
                onPress={() => updateQuantity(product.id, 1)}
              />
            </View>
          </View>
        ))}

        {selected.length === 0 && (
          <Text style={{
            marginTop: 20,
            color: COLORS.textGray,
          }}>
            Votre panier est vide.
          </Text>
        )}

        <Field
          label="Note pour le restaurant (facultatif)"
          value={notes}
          onChangeText={setNotes}
        />

        <View style={{
          marginTop: 15,
          padding: 18,
          backgroundColor: COLORS.card,
          borderRadius: 15,
        }}>
          <Text style={{
            fontSize: 15,
            color: COLORS.textGray,
          }}>
            Total de la commande
          </Text>

          <Text style={styles.total}>
            {money(total)}
          </Text>
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
  const [orders,setOrders]=useState([]); const [loading,setLoading]=useState(true);

  const load = useCallback(async (showAlert = false) => {
    debugLog('COMMANDES', 'Chargement des commandes');
    try {
      const d = await api('/api/orders/mine');
      setOrders(Array.isArray(d?.orders) ? d.orders : []);
      debugLog('COMMANDES', `Chargement réussi : ${Array.isArray(d?.orders) ? d.orders.length : 0} commande(s)`);
    } catch (error) {
      debugError('COMMANDES / API', error, showAlert);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(false), 15000);
    return () => clearInterval(timer);
  }, [load]);
  
  const labels={pending:'En attente de confirmation',accepted:'Acceptée',preparing:'En préparation',ready:'PRÊTE — venez la récupérer !',picked_up:'Récupérée / payée',cancelled:'Annulée'};
  
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Mes commandes</Text>
        <Button title="Actualiser" secondary onPress={load}/>
      </View>
      {loading ? <ActivityIndicator color={COLORS.accent}/> : (
        <FlatList 
          data={orders} 
          keyExtractor={o=>String(o.id)} 
          contentContainerStyle={styles.list} 
          ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color: COLORS.textGray}}>Aucune commande pour le moment.</Text>} 
          renderItem={({item})=>(
            <View style={styles.orderCard}>
              <Text style={styles.productName}>{item.order_number}</Text>
              <Text style={[styles.status,item.status==='ready'&&styles.ready]}>{labels[item.status]||item.status}</Text>
              {(item.items||[]).map((p,i)=>(
                <View key={i} style={{marginTop:5}}>
                  <Text style={{color: COLORS.textGray}}>{p.quantity} × {p.product_name} — {money(p.line_total)}</Text>
                  {(p.options||[]).map((option,j)=><Text key={j} style={{color:COLORS.textGray,fontSize:12,marginLeft:12}}>• {option.option_name} — {money(option.unit_price)}</Text>)}
                </View>
              ))}
              <Text style={styles.total}>{money(item.total)}</Text>
              <Text style={styles.description}>Paiement : espèces au retrait</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function AccountScreen() {
  const auth=useContext(AuthContext); const [user,setUser]=useState(null);
  
  useEffect(() => {
    debugLog('COMPTE', 'Chargement du profil');
    api('/api/auth/me')
      .then(d => {
        if (!d?.user) throw new Error('Réponse du profil invalide : user absent.');
        setUser(d.user);
        debugLog('COMPTE', 'Profil chargé');
      })
      .catch(error => debugError('COMPTE / API PROFIL', error));
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Mon compte</Text>
        {user && (
          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{user.name}</Text>
            <Text style={{color: COLORS.textGray}}>{user.email}</Text>
            <Text style={{color: COLORS.textGray}}>{user.phone}</Text>
          </View>
        )}
        <Button title="Se déconnecter" secondary onPress={async()=>{
          try {
            debugLog('DÉCONNEXION', 'Suppression du jeton');
            await clearToken();
            await auth.reload();
          } catch (error) {
            debugError('DÉCONNEXION', error);
          }
        }}/>
      </View>
    </SafeAreaView>
  );
}

function MainNavigator() {
  const auth=useContext(AuthContext);
  if(auth.loading)return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.accent}/></View>;
  
  return (
    <Stack.Navigator screenOptions={{
      headerTintColor: COLORS.primary,
      headerTitleStyle:{fontWeight:'700'},
      headerStyle: { backgroundColor: COLORS.background },
      headerShadowVisible: false,
    }}>
      {!auth.loggedIn ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{headerShown:false}}/>
          <Stack.Screen name="Register" component={RegisterScreen} options={{title:'Inscription'}}/>
        </>
      ) : (
        <>
          <Stack.Screen name="Menu" component={MenuScreen} options={{headerShown:false}}/>
          <Stack.Screen name="Cart" component={CartScreen} options={{title:'Panier'}}/>
          <Stack.Screen name="MealComposer" component={MealComposerScreen} options={{title:'Composer mon repas'}}/>
          <Stack.Screen name="RateMeal" component={RateMealScreen} options={{title:'Évaluer un repas'}}/>
          <Stack.Screen name="Orders" component={OrdersScreen} options={{title:'Mes commandes'}}/>
          <Stack.Screen name="Account" component={AccountScreen} options={{title:'Mon compte'}}/>
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [loggedIn,setLoggedIn]=useState(false); const [loading,setLoading]=useState(true);
  
  const reload = useCallback(async () => {
    debugLog('SESSION', 'Début du rechargement');
    setLoading(true);

    try {
      const token = await getToken();

      if (!token) {
        debugLog('SESSION', 'Aucun jeton enregistré');
        setLoggedIn(false);
        return false;
      }

      debugLog('SESSION', 'Vérification du jeton auprès du serveur');
      const response = await api('/api/auth/me');

      if (!response?.user) {
        throw new Error('La route /api/auth/me n’a pas renvoyé response.user.');
      }

      debugLog('SESSION', 'Session validée');
      setLoggedIn(true);
      return true;
    } catch (error) {
      debugError('SESSION / AUTHENTIFICATION', error, false);
      setLoggedIn(false);

      try {
        await clearToken();
        debugLog('SESSION', 'Jeton supprimé après échec de validation');
      } catch (storageError) {
        debugError('SESSION / SUPPRESSION DU JETON', storageError, false);
      }

      return false;
    } finally {
      setLoading(false);
      debugLog('SESSION', 'Chargement terminé');
    }
  }, []);

  useEffect(() => {
    debugLog('APP', 'Démarrage de l’application');
    reload().catch(error =>
      debugError('APP / RELOAD NON GÉRÉ', error, false)
    );
  }, [reload]);

  useEffect(() => {
    if (!loggedIn) return undefined;

    let mounted = true;
    let unsubscribe = () => {};

    async function setupNotifications() {
      debugLog('FIREBASE', 'Début de l’initialisation');
      try {
        await registerPushNotifications();
        debugLog('FIREBASE', 'Enregistrement des notifications terminé');

        if (!mounted) return;

        const stopListening = listenForPush(msg => {
          debugLog('FIREBASE', 'Notification reçue');
          const title = msg?.notification?.title || 'Mise à jour de commande';
          const body = msg?.notification?.body || 'Consultez vos commandes.';
          Alert.alert(title, body);
        });

        if (typeof stopListening === 'function') {
          unsubscribe = stopListening;
        }
        debugLog('FIREBASE', 'Écoute des notifications activée');
      } catch (error) {
        debugError('FIREBASE / NOTIFICATIONS', error);
      }
    }

    setupNotifications().catch(error =>
      debugError('FIREBASE / ERREUR NON GÉRÉE', error, false)
    );

    return () => {
      mounted = false;
      try {
        unsubscribe();
        debugLog('FIREBASE', 'Écoute des notifications arrêtée');
      } catch (error) {
        debugError('FIREBASE / ARRÊT ÉCOUTE', error, false);
      }
    };
  }, [loggedIn]);

  return (
    <AuthContext.Provider value={{loggedIn,loading,reload}}>
      <NavigationContainer>
        <StatusBar barStyle="dark-content"/>
        <MainNavigator/>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

// --- STYLES (Refondus pour correspondre à l'image) ---
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  
  // Textes de base
  logo: { fontSize: 32, fontWeight: '900', color: COLORS.primary, marginTop: 30, textAlign: 'center' },
  subtitle: { fontSize: 16, color: COLORS.textGray, marginBottom: 20, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.primary },
  greetingText: { fontSize: 16, color: COLORS.textGray, fontWeight: '500', marginBottom: 2 },
  
  // Header Menu
  topRow: { paddingHorizontal: 20, paddingTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  cartIcon: { fontSize: 22 },
  cartBadge: { position: 'absolute', top: 5, right: 5, backgroundColor: COLORS.accent, borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  // Recherche & Filtres
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, marginHorizontal: 20, marginTop: 20, paddingHorizontal: 15, paddingVertical: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  searchIcon: { fontSize: 18, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.primary },
  
  filterRow: { 
  flexDirection: 'row',
  paddingHorizontal: 20,
  gap: 15,
  alignItems: 'center', },
  filterBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: 'transparent' },
  activeFilter: { backgroundColor: COLORS.primary },
  filterText: { color: COLORS.textGray, fontWeight: '600', fontSize: 15 },
  activeFilterText: { color: '#FFF' },

  // Liste des produits
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.primary, marginLeft: 20, marginTop: 25, marginBottom: 15 },
  horizontalList: { paddingLeft: 20, paddingRight: 10 },
  
  productCard: { 
    width: 160, 
    backgroundColor: COLORS.card, 
    borderRadius: 24, 
    marginRight: 15, 
    padding: 12,
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 8 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 15, 
    elevation: 6 
  },
  imageContainer: { alignItems: 'center', marginBottom: 10 },
  productImage: { width: 110, height: 110, borderRadius: 55 }, // Image ronde
  imagePlaceholder: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center' },
  
  cardContent: { paddingHorizontal: 5 },
  productName: { fontSize: 16, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  description: { fontSize: 12, color: COLORS.textGray, marginBottom: 8 },
  price: { fontSize: 16, fontWeight: '800', color: COLORS.accent },
  
  addButtonFloat: { 
    position: 'absolute', 
    bottom: -10, 
    right: 15, 
    backgroundColor: COLORS.accent, 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 5
  },
  addText: { color: 'white', fontSize: 22, fontWeight: '600', marginTop: -2 },

  bottomNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 40, gap: 15 },
  navBtn: { flex: 1 },

  // Formulaires & Boutons généraux
  field: { marginVertical: 8 },
  label: { fontWeight: '700', marginBottom: 6, color: COLORS.primary, fontSize: 14 },
  input: { backgroundColor: COLORS.card, borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, color: COLORS.primary, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  
  button: { paddingHorizontal: 20, paddingVertical: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  primaryButton: { backgroundColor: COLORS.primary },
  secondary: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0' },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  // Panier & Commandes
  list: { padding: 20, paddingBottom: 30 },
  cartRow: { paddingVertical: 15, borderBottomWidth: 1, borderColor: '#E0E0E0', flexDirection: 'row', alignItems: 'center' },
  quantity: { flexDirection: 'row', gap: 8 },
  total: { fontSize: 20, fontWeight: '900', marginTop: 15, color: COLORS.primary },
  orderCard: { backgroundColor: COLORS.card, padding: 20, borderRadius: 20, marginBottom: 15, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  status: { fontWeight: '800', color: '#b36a00', marginVertical: 6, fontSize: 14 },
  ready: { color: '#16803d', fontSize: 16 },
  clearSearchButton: {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: '#E8EAF0',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 8,
},

clearSearchText: {
  fontSize: 16,
  fontWeight: '700',
  color: COLORS.primary,
},

emptySearch: {
  width: Math.min(Dimensions.get('window').width - 40, 340),
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 20,
  paddingVertical: 35,
  backgroundColor: COLORS.card,
  borderRadius: 20,
  marginHorizontal: 20,
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
  profileCard: { backgroundColor: COLORS.card, padding: 20, borderRadius: 20, marginVertical: 15, gap: 5 }
});