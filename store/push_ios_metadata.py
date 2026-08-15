import jwt, time, json, urllib.request
KEY_ID="CJ66MD2PJ6"; ISSUER="79329414-a921-49f4-9709-d23b5df6e680"
p8=open(r"C:/Users/david/Downloads/AuthKey_CJ66MD2PJ6.p8").read()
APP="6793767985"

def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER,"iat":now,"exp":now+900,"aud":"appstoreconnect-v1"},p8,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})

def req(method,path,body=None):
    url="https://api.appstoreconnect.apple.com"+path
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(url,data=data,method=method,
        headers={"Authorization":"Bearer "+tok(),"Content-Type":"application/json"})
    try:
        resp=urllib.request.urlopen(r,timeout=40)
        raw=resp.read().decode()
        return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, {"error":e.read().decode()[:600]}

# 1. get version + its en-US localization
_,v=req("GET",f"/v1/apps/{APP}/appStoreVersions?limit=1")
vid=v["data"][0]["id"]
_,L=req("GET",f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")
locid=L["data"][0]["id"]
print("version",vid,"locale",locid)

DESC="""Some conversations don't have an exit. Pardon Me gives you one.

Trigger a real-looking incoming call - full screen, on the lock screen, with a proper ringtone. Answer it, say "sorry, I have to take this," and walk away.

LOOKS REAL
- Full-screen incoming call, exactly like the real thing
- Classic telephone ringtone
- Rings and vibrates over the lock screen
- Answer to see a live call timer
- When you hang up, you're back where you were

CHOOSE WHO'S CALLING
- Quick presets: Boss, Wife, Emergency
- Or type any name you like
- The name shows on the call screen

SCHEDULE AHEAD
Know a meeting will run long? Schedule a call before you go in, and it arrives on time.

PRIVATE BY DESIGN
- No account, no sign-up
- No ads, no analytics, no tracking
- Nothing leaves your phone
- Does not read contacts, messages, or your call history
- Does not touch your real calls

Pardon Me is an escape hatch, not a lie detector. Use it kindly."""

# 2. update version localization
s,r=req("PATCH",f"/v1/appStoreVersionLocalizations/{locid}",{
  "data":{"type":"appStoreVersionLocalizations","id":locid,"attributes":{
    "description":DESC,
    "keywords":"fake call,escape,excuse,safety,exit,ring,ringtone,get out,busy",
    "supportUrl":"https://tall216.github.io/pardon-me/",
    "marketingUrl":"https://tall216.github.io/pardon-me/",
    "promotionalText":"Double-press for a realistic fake call and a graceful way out of any conversation. Private by design - no account, no tracking, nothing leaves your phone."
  }}})
print("localization PATCH:",s, r.get("error",""))

# 3. copyright on version
s,r=req("PATCH",f"/v1/appStoreVersions/{vid}",{
  "data":{"type":"appStoreVersions","id":vid,"attributes":{"copyright":"2026 David Evans"}}})
print("version copyright PATCH:",s, r.get("error",""))

# 4. app info localization: subtitle + privacy policy url
_,ai=req("GET",f"/v1/apps/{APP}/appInfos")
aiid=ai["data"][0]["id"]
_,ail=req("GET",f"/v1/appInfos/{aiid}/appInfoLocalizations")
ailid=[x["id"] for x in ail["data"] if x["attributes"].get("locale")=="en-US"][0]
s,r=req("PATCH",f"/v1/appInfoLocalizations/{ailid}",{
  "data":{"type":"appInfoLocalizations","id":ailid,"attributes":{
    "subtitle":"Your polite exit, any time",
    "privacyPolicyUrl":"https://tall216.github.io/pardon-me/privacy"
  }}})
print("appInfo localization PATCH:",s, r.get("error",""))
print("\\nDONE metadata push.")
