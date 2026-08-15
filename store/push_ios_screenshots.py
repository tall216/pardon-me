import jwt, time, json, urllib.request, hashlib, os, glob
KEY_ID="CJ66MD2PJ6"; ISSUER="79329414-a921-49f4-9709-d23b5df6e680"
p8=open(r"C:/Users/david/Downloads/AuthKey_CJ66MD2PJ6.p8").read()
APP="6793767985"

def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER,"iat":now,"exp":now+900,"aud":"appstoreconnect-v1"},p8,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})

def req(method,path,body=None,raw_url=None,raw_bytes=None,extra_headers=None):
    url=raw_url or ("https://api.appstoreconnect.apple.com"+path)
    if raw_bytes is not None:
        data=raw_bytes
        headers=extra_headers or {}
    else:
        data=json.dumps(body).encode() if body is not None else None
        headers={"Authorization":"Bearer "+tok(),"Content-Type":"application/json"}
    r=urllib.request.Request(url,data=data,method=method,headers=headers)
    try:
        resp=urllib.request.urlopen(r,timeout=120)
        rr=resp.read().decode()
        return resp.status,(json.loads(rr) if rr and rr.strip().startswith(("{","[")) else rr)
    except urllib.error.HTTPError as e:
        return e.code,{"error":e.read().decode()[:600]}

# version + en-US localization
_,v=req("GET",f"/v1/apps/{APP}/appStoreVersions?limit=1")
vid=v["data"][0]["id"]
_,L=req("GET",f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")
locid=[x["id"] for x in L["data"] if x["attributes"].get("locale")=="en-US"][0]
print("loc",locid)

# create a screenshot set for 6.7" display (APP_IPHONE_67)
DISPLAY="APP_IPHONE_67"
# check existing sets
_,sets=req("GET",f"/v1/appStoreVersionLocalizations/{locid}/appScreenshotSets")
existing=[s for s in sets.get("data",[]) if s["attributes"]["screenshotDisplayType"]==DISPLAY]
if existing:
    setid=existing[0]["id"]; print("reuse set",setid)
else:
    s,r=req("POST","/v1/appScreenshotSets",{"data":{"type":"appScreenshotSets",
        "attributes":{"screenshotDisplayType":DISPLAY},
        "relationships":{"appStoreVersionLocalization":{"data":{"type":"appStoreVersionLocalizations","id":locid}}}}})
    print("create set:",s, r if s>=400 else "")
    setid=r["data"]["id"]

files=sorted(glob.glob("store/screenshots_ios/*.png"))
for f in files:
    data=open(f,"rb").read()
    fname=os.path.basename(f)
    # 1. reserve
    s,r=req("POST","/v1/appScreenshots",{"data":{"type":"appScreenshots",
        "attributes":{"fileName":fname,"fileSize":len(data)},
        "relationships":{"appScreenshotSet":{"data":{"type":"appScreenshotSets","id":setid}}}}})
    if s>=400:
        print(fname,"reserve FAIL",s,r); continue
    ssid=r["data"]["id"]
    op=r["data"]["attributes"]["uploadOperations"][0]
    # 2. upload bytes to the provided URL
    hdrs={h["name"]:h["value"] for h in op["requestHeaders"]}
    us,ur=req(op["method"],None,raw_url=op["url"],raw_bytes=data,extra_headers=hdrs)
    if us>=400:
        print(fname,"upload FAIL",us,ur); continue
    # 3. commit with md5
    md5=hashlib.md5(data).hexdigest()
    cs,cr=req("PATCH",f"/v1/appScreenshots/{ssid}",{"data":{"type":"appScreenshots","id":ssid,
        "attributes":{"uploaded":True,"sourceFileChecksum":md5}}})
    print(fname,"->",cs,"committed" if cs<400 else cr)
print("DONE screenshots")
