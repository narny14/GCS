
import React, {useEffect, useState, createContext, useContext} from 'react';
import {ActivityIndicator, Alert, FlatList, Image, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {api, saveToken, clearToken, getToken} from './api';
import {registerPushNotifications, listenForPush} from './notifications';

const Stack = createNativeStackNavigator();
const AuthContext = createContext(null);
const money = n => new Intl.NumberFormat('fr-FR', {style:'currency', currency:'GBP'}).format(Number(n || 0));

function Button({title, onPress, secondary, disabled}) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && {opacity:0.5}]}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
}
function Field({label, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize || 'sentences'} /></View>;
}
function LoginScreen({navigation}) {
  const auth = useContext(AuthContext);
  const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [busy,setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { const d = await api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})}); await saveToken(d.token); await auth.reload(); }
    catch(e){Alert.alert('Connexion impossible',e.message);} finally{setBusy(false);}
  }
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}><Text style={styles.logo}>FastFood One</Text><Text style={styles.subtitle}>Commandez. Récupérez. Savourez.</Text>
    <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
    <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
    <Button title={busy?'Connexion…':'Se connecter'} onPress={submit} disabled={busy}/>
    <Button title="Créer un compte" secondary onPress={()=>navigation.navigate('Register')}/>
  </ScrollView></SafeAreaView>;
}
function RegisterScreen() {
  const auth = useContext(AuthContext);
  const [name,setName] = useState(''); const [email,setEmail] = useState(''); const [phone,setPhone] = useState(''); const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { const d = await api('/api/auth/register',{method:'POST',body:JSON.stringify({name,email,phone,password})}); await saveToken(d.token); await auth.reload(); }
    catch(e){Alert.alert('Inscription impossible',e.message);} finally{setBusy(false);}
  }
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Créer un compte</Text>
    <Field label="Nom complet" value={name} onChangeText={setName}/>
    <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
    <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
    <Field label="Mot de passe (10 caractères minimum)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"/>
    <Button title={busy?'Création…':'Créer mon compte'} onPress={submit} disabled={busy}/>
  </ScrollView></SafeAreaView>;
}
function MenuScreen({navigation}) {
  const [products,setProducts] = useState([]); const [cart,setCart] = useState({}); const [loading,setLoading] = useState(true);
  async function load(){try{const d=await api('/api/products');setProducts(d.products||[]);}catch(e){Alert.alert('Menu indisponible',e.message);}finally{setLoading(false);}}
  // Recharge le menu périodiquement : un plat ajouté dans le tableau de bord
  // apparaît sur le téléphone sans réinstallation de l'application.
  useEffect(()=>{
    load();
    const timer = setInterval(() => { load(); }, 15000);
    return () => clearInterval(timer);
  },[]);
  const count = Object.values(cart).reduce((a,b)=>a+b,0);
  return <SafeAreaView style={styles.screen}><View style={styles.topRow}><Text style={styles.title}>Notre menu</Text><Button title={`Panier (${count})`} onPress={()=>navigation.navigate('Cart',{cart,products,setCart})}/></View>
    {loading?<ActivityIndicator size="large"/>:<FlatList data={products} keyExtractor={p=>String(p.id)} contentContainerStyle={styles.list} renderItem={({item})=><View style={styles.product}>
      {item.image_url ? <Image source={{uri:item.image_url}} style={styles.productImage}/> : <View style={styles.imagePlaceholder}><Text style={{fontSize:28}}>🍔</Text></View>}
      <View style={{flex:1}}><Text style={styles.productName}>{item.name}</Text><Text style={styles.description}>{item.description||item.category}</Text><Text style={styles.price}>{money(item.price)}</Text></View>
      <TouchableOpacity style={styles.add} onPress={()=>setCart(c=>({...c,[item.id]:(c[item.id]||0)+1}))}><Text style={styles.addText}>+</Text></TouchableOpacity>
    </View>}/>}
    <View style={styles.bottomNav}><Button title="Mes commandes" secondary onPress={()=>navigation.navigate('Orders')}/><Button title="Mon compte" secondary onPress={()=>navigation.navigate('Account')}/></View>
  </SafeAreaView>;
}
function CartScreen({route,navigation}) {
  const {cart,products,setCart}=route.params;
  const [notes,setNotes]=useState(''); const [busy,setBusy]=useState(false);
  const selected=products.filter(p=>cart[p.id]).map(p=>({...p,quantity:cart[p.id]}));
  const total=selected.reduce((sum,p)=>sum+Number(p.price)*p.quantity,0);
  async function placeOrder(){
    setBusy(true);
    try {
      const me=await api('/api/auth/me');
      const d=await api('/api/orders',{method:'POST',body:JSON.stringify({customer_name:me.user.name,customer_phone:me.user.phone,notes,items:selected.map(p=>({product_id:p.id,quantity:p.quantity}))})});
      setCart({}); Alert.alert('Commande confirmée',`Votre numéro : ${d.order.order_number}`); navigation.replace('Orders');
    } catch(e){Alert.alert('Commande impossible',e.message);} finally{setBusy(false);}
  }
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Votre panier</Text>
    {selected.map(p=><View style={styles.cartRow} key={p.id}><View style={{flex:1}}><Text style={styles.productName}>{p.name}</Text><Text>{money(p.price)} × {p.quantity}</Text></View><View style={styles.quantity}><Button title="−" secondary onPress={()=>setCart(c=>{const n={...c};if((n[p.id]||0)<=1)delete n[p.id];else n[p.id]--;return n;})}/><Button title="+" onPress={()=>setCart(c=>({...c,[p.id]:(c[p.id]||0)+1}))}/></View></View>)}
    {!selected.length&&<Text>Votre panier est vide.</Text>}
    <Field label="Note pour le restaurant (facultatif)" value={notes} onChangeText={setNotes}/>
    <Text style={styles.total}>Total : {money(total)}</Text><Text style={styles.description}>Paiement en espèces lors du retrait au restaurant.</Text>
    <Button title={busy?'Envoi…':'Confirmer la commande'} onPress={placeOrder} disabled={busy||!selected.length}/>
  </ScrollView></SafeAreaView>;
}
function OrdersScreen() {
  const [orders,setOrders]=useState([]); const [loading,setLoading]=useState(true);
  async function load(){try{const d=await api('/api/orders/mine');setOrders(d.orders||[]);}catch(e){Alert.alert('Commandes',e.message);}finally{setLoading(false);}}
  useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer);},[]);
  const labels={pending:'En attente de confirmation',accepted:'Acceptée',preparing:'En préparation',ready:'PRÊTE — venez la récupérer !',picked_up:'Récupérée / payée',cancelled:'Annulée'};
  return <SafeAreaView style={styles.screen}><View style={styles.topRow}><Text style={styles.title}>Mes commandes</Text><Button title="Actualiser" secondary onPress={load}/></View>
    {loading?<ActivityIndicator/>:<FlatList data={orders} keyExtractor={o=>String(o.id)} contentContainerStyle={styles.list} ListEmptyComponent={<Text>Aucune commande pour le moment.</Text>} renderItem={({item})=><View style={styles.orderCard}>
      <Text style={styles.productName}>{item.order_number}</Text><Text style={[styles.status,item.status==='ready'&&styles.ready]}>{labels[item.status]||item.status}</Text>
      {(item.items||[]).map((p,i)=><Text key={i}>{p.quantity} × {p.product_name} — {money(p.line_total)}</Text>)}
      <Text style={styles.total}>{money(item.total)}</Text><Text style={styles.description}>Paiement : espèces au retrait</Text>
    </View>}/>}
  </SafeAreaView>;
}
function AccountScreen() {
  const auth=useContext(AuthContext); const [user,setUser]=useState(null);
  useEffect(()=>{api('/api/auth/me').then(d=>setUser(d.user)).catch(e=>Alert.alert('Compte',e.message));},[]);
  return <SafeAreaView style={styles.screen}><View style={styles.content}><Text style={styles.title}>Mon compte</Text>{user&&<><Text>{user.name}</Text><Text>{user.email}</Text><Text>{user.phone}</Text></>}<Button title="Se déconnecter" secondary onPress={async()=>{await clearToken();await auth.reload();}}/></View></SafeAreaView>;
}
function MainNavigator() {
  const auth=useContext(AuthContext);
  if(auth.loading)return <View style={styles.center}><ActivityIndicator size="large"/></View>;
  return <Stack.Navigator screenOptions={{headerTintColor:'#176b45',headerTitleStyle:{fontWeight:'700'}}}>
    {!auth.loggedIn ? <><Stack.Screen name="Login" component={LoginScreen} options={{headerShown:false}}/><Stack.Screen name="Register" component={RegisterScreen} options={{title:'Inscription'}}/></> :
    <><Stack.Screen name="Menu" component={MenuScreen} options={{headerShown:false}}/><Stack.Screen name="Cart" component={CartScreen} options={{title:'Panier'}}/><Stack.Screen name="Orders" component={OrdersScreen} options={{title:'Mes commandes'}}/><Stack.Screen name="Account" component={AccountScreen} options={{title:'Mon compte'}}/></>}
  </Stack.Navigator>;
}
export default function App() {
  const [loggedIn,setLoggedIn]=useState(false); const [loading,setLoading]=useState(true);
  async function reload(){const token=await getToken();if(!token){setLoggedIn(false);setLoading(false);return;}try{await api('/api/auth/me');setLoggedIn(true);}catch{await clearToken();setLoggedIn(false);}finally{setLoading(false);}}
  useEffect(()=>{reload();},[]);
  useEffect(()=>{
    if(!loggedIn)return;
    registerPushNotifications().catch(()=>{});
    const unsubscribe=listenForPush(msg=>{
      const title=msg?.notification?.title||'Mise à jour de commande';
      const body=msg?.notification?.body||'Consultez vos commandes.';
      Alert.alert(title,body);
    });
    return unsubscribe;
  },[loggedIn]);
  return <AuthContext.Provider value={{loggedIn,loading,reload}}><NavigationContainer><StatusBar barStyle="dark-content"/><MainNavigator/></NavigationContainer></AuthContext.Provider>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#f6f7f8'},content:{padding:20,gap:12},center:{flex:1,justifyContent:'center',alignItems:'center'},
  logo:{fontSize:32,fontWeight:'900',color:'#176b45',marginTop:30},subtitle:{fontSize:16,color:'#62676c',marginBottom:16},title:{fontSize:24,fontWeight:'800',color:'#202124'},topRow:{padding:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
  field:{marginVertical:5},label:{fontWeight:'700',marginBottom:6,color:'#343a40'},input:{backgroundColor:'white',borderColor:'#d4d7da',borderWidth:1,borderRadius:10,paddingHorizontal:12,paddingVertical:11,color:'#202124'},
  button:{backgroundColor:'#176b45',paddingHorizontal:14,paddingVertical:12,borderRadius:10,alignItems:'center',justifyContent:'center',marginVertical:4},secondary:{backgroundColor:'#50565c'},buttonText:{color:'white',fontWeight:'800'},
  list:{padding:14,paddingBottom:30},product:{backgroundColor:'white',padding:12,borderRadius:14,marginBottom:12,flexDirection:'row',alignItems:'center',gap:12},productImage:{width:72,height:72,borderRadius:10},imagePlaceholder:{width:72,height:72,borderRadius:10,backgroundColor:'#e8eee9',alignItems:'center',justifyContent:'center'},
  productName:{fontSize:16,fontWeight:'800',color:'#202124'},description:{color:'#666d73',marginTop:4},price:{fontWeight:'800',color:'#176b45',marginTop:6},add:{backgroundColor:'#176b45',width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center'},addText:{color:'white',fontSize:25,fontWeight:'700'},
  bottomNav:{paddingHorizontal:14,paddingBottom:10,flexDirection:'row',gap:8,justifyContent:'space-between'},cartRow:{paddingVertical:12,borderBottomWidth:1,borderColor:'#e1e4e6',flexDirection:'row',alignItems:'center'},quantity:{flexDirection:'row',gap:6},total:{fontSize:19,fontWeight:'900',marginTop:12},orderCard:{backgroundColor:'white',padding:16,borderRadius:14,marginBottom:12,gap:6},status:{fontWeight:'800',color:'#b36a00',marginVertical:4},ready:{color:'#16803d',fontSize:16}
});
