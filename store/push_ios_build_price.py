import jwt, time, json, urllib.request
KEY_ID="CJ66MD2PJ6"; ISSUER="79329414-a921-49f4-9709-d23b5df6e680"
p8=open(r"C:/Users/david/Downloads/AuthKey_CJ66MD2PJ6.p8").read()
APP="6793767985"
def tok():
    now=int(time.time())
    return jwt.encode({"iss":ISSUER,"iat":now,"exp":now+900,"aud":"appstoreconnect-v1"},p8,algorithm="ES256",headers={"kid":KEY_ID,"typ":"JWT"})
def req(method,path,body=None):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request("https://api.appstoreconnect.apple.com"+path,data=data,method=method,
        headers={"Authorization":"Bearer "+tok(),"Content-Type":"application/json"})
    try:
        resp=urllib.request.urlopen(r,timeout=40); rr=resp.read().decode()
        return resp.status,(json.loads(rr) if rr else {})
    except urllib.error.HTTPError as e:
        return e.code,{"error":e.read().decode()[:600]}

# version id + latest build id
_,v=req("GET",f"/v1/apps/{APP}/appStoreVersions?limit=1")
vid=v["data"][0]["id"]
_,b=req("GET",f"/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=1")
bid=b["data"][0]["id"]
print("version",vid,"build",bid)

# 1. attach build to version
s,r=req("PATCH",f"/v1/appStoreVersions/{vid}/relationships/build",
    {"data":{"type":"builds","id":bid}})
print("attach build:",s, r.get("error","") if isinstance(r,dict) else r)

# 2. pricing -> Free. Modern API uses appPriceSchedule with price point for tier 0 (USD 0.00)
# find the USD free price point for this app
s,pp=req("GET",f"/v1/apps/{APP}/appPricePoints?filter[territory]=USA&limit=200")
free=None
if s<400:
    for p in pp.get("data",[]):
        a=p["attributes"]
        if a.get("customerPrice") in ("0","0.0","0.00",0):
            free=p["id"]; break
print("free price point:",free, "(status",s,")")
if free:
    s,r=req("POST","/v2/appPriceSchedules",{
        "data":{"type":"appPriceSchedules",
            "relationships":{
                "app":{"data":{"type":"apps","id":APP}},
                "baseTerritory":{"data":{"type":"territories","id":"USA"}},
                "manualPrices":{"data":[{"type":"appPrices","id":"${price1}"}]}
            }},
        "included":[{"type":"appPrices","id":"${price1}",
            "attributes":{"startDate":None},
            "relationships":{"appPricePoint":{"data":{"type":"appPricePoints","id":free}}}}]
    })
    print("set free pricing:",s, r.get("error","") if isinstance(r,dict) else r)
else:
    print("could not resolve free price point; set price to Free manually in ASC.")
