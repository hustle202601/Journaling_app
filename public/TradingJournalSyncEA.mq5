//+------------------------------------------------------------------+
//|                                         TradingJournalSyncEA.mq5 |
//|          Sends MT5 account data to your self-hosted trading journal |
//+------------------------------------------------------------------+
#property copyright "Trading Journal"
#property version   "1.00"
#property description "Syncs MT5 balance, equity, open positions and closed deals to your trading journal."
#property strict

input string InpServerUrl      = "https://your-journal.example.com"; // Journal server URL (no trailing slash)
input string InpToken          = "";                                  // Connection token from the journal
input int    InpSyncMinutes    = 1;                                   // Sync every N minutes
input int    InpHistoryDays    = 0;                                   // First sync history in days (0 = all available)
input int    InpOverlapHours   = 24;                                  // Re-send overlap after the last sync
input int    InpTimeoutMs      = 20000;                               // WebRequest timeout in milliseconds
input int    InpMaxRetries     = 3;                                   // Retries for temporary failures
input bool   InpLogDetails     = false;                               // Print response bodies in the Experts log
input bool   InpResetHistory   = false;                               // Reset the local last-sync marker on attach

struct PositionOpen
{
   long      positionId;
   int       side;          // 1 = buy, -1 = sell
   double    volume;
   double    value;         // sum(openPrice * volume)
   datetime  openTime;
   double    sl;
   double    tp;
   double    commission;
};

struct ClosedDeal
{
   long      dealId;
   long      positionId;
   string    symbol;
   int       side;
   double    volume;
   datetime  openTime;
   datetime  closeTime;
   double    openPrice;
   double    closePrice;
   double    sl;
   double    tp;
   double    commission;
   double    swap;
   double    profit;
   string    reason;
   string    comment;
   long      magic;
};

struct DealCandidate
{
   long      dealId;
   long      positionId;
};

bool     g_syncing = false;
datetime g_lastAttempt = 0;
datetime g_lastSyncMarker = 0;
int      g_serverOffset = 0;

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string NormalizeUrl(const string value)
{
   string url = value;
   StringTrimLeft(url);
   StringTrimRight(url);
   while(StringLen(url) > 0 && StringGetCharacter(url, StringLen(url) - 1) == '/')
      url = StringSubstr(url, 0, StringLen(url) - 1);
   return url;
}

string SafeName(const string value)
{
   string out = value;
   StringReplace(out, " ", "_");
   StringReplace(out, "/", "_");
   StringReplace(out, "\\", "_");
   StringReplace(out, ":", "_");
   return out;
}

string SyncMarkerKey()
{
   return StringFormat("TJ_MT5_LASTSYNC_%I64d_%s",
                       AccountInfoInteger(ACCOUNT_LOGIN),
                       SafeName(AccountInfoString(ACCOUNT_SERVER)));
}

int ServerOffsetSeconds()
{
   double raw = (double)(TimeCurrent() - TimeGMT());
   return (int)(MathRound(raw / 900.0) * 900);
}

string IsoTime(const datetime serverTime)
{
   datetime utc = serverTime - g_serverOffset;
   string text = TimeToString(utc, TIME_DATE | TIME_SECONDS);
   StringReplace(text, ".", "-");
   StringReplace(text, " ", "T");
   return text + "Z";
}

string JsonEscape(const string value)
{
   string out = "";
   int length = StringLen(value);
   for(int i = 0; i < length; i++)
   {
      ushort code = StringGetCharacter(value, i);
      if(code == '"' || code == '\\')
         out += "\\" + ShortToString(code);
      else if(code == '\n')
         out += "\\n";
      else if(code == '\r')
         out += "\\r";
      else if(code == '\t')
         out += "\\t";
      else if(code < 32)
         out += StringFormat("\\u%04x", code);
      else
         out += ShortToString(code);
   }
   return out;
}

string JsonString(const string value)
{
   return "\"" + JsonEscape(value) + "\"";
}

string JNum(const double value, const int digits = 8)
{
   if(!MathIsValidNumber(value))
      return "0";
   return DoubleToString(value, digits);
}

string JBool(const bool value)
{
   return value ? "true" : "false";
}

string ReasonText(const long reason)
{
   if(reason == DEAL_REASON_SL)       return "sl";
   if(reason == DEAL_REASON_TP)       return "tp";
   if(reason == DEAL_REASON_SO)       return "stopout";
   if(reason == DEAL_REASON_MOBILE)   return "mobile";
   if(reason == DEAL_REASON_WEB)      return "web";
   if(reason == DEAL_REASON_EXPERT)   return "ea";
   if(reason == DEAL_REASON_CLIENT)   return "manual";
   if(reason == DEAL_REASON_ROLLOVER) return "rollover";
   if(reason == DEAL_REASON_VMARGIN)  return "margin";
   if(reason == DEAL_REASON_SPLIT)    return "split";
   return "other";
}

bool IsTradeDeal(const long dealTicket)
{
   long type = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   return type == DEAL_TYPE_BUY || type == DEAL_TYPE_SELL;
}

int DealSide(const long dealTicket)
{
   long type = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   if(type == DEAL_TYPE_BUY)  return 1;
   if(type == DEAL_TYPE_SELL) return -1;
   return 0;
}

bool IsClosingEntry(const long entry)
{
   return entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT;
}

double DealCommission(const long dealTicket)
{
   return HistoryDealGetDouble(dealTicket, DEAL_COMMISSION) + HistoryDealGetDouble(dealTicket, DEAL_FEE);
}

void ReadOrderSlTp(const long dealTicket, double &sl, double &tp)
{
   sl = 0.0;
   tp = 0.0;
   long orderTicket = HistoryDealGetInteger(dealTicket, DEAL_ORDER);
   if(orderTicket <= 0)
      return;
   if(HistoryOrderSelect((ulong)orderTicket))
   {
      sl = HistoryOrderGetDouble((ulong)orderTicket, ORDER_SL);
      tp = HistoryOrderGetDouble((ulong)orderTicket, ORDER_TP);
   }
}

bool IsCandidate(const long &candidates[], const long dealTicket)
{
   for(int i = 0; i < ArraySize(candidates); i++)
      if(candidates[i] == dealTicket)
         return true;
   return false;
}

bool HasPosition(const long &positions[], const long positionId)
{
   for(int i = 0; i < ArraySize(positions); i++)
      if(positions[i] == positionId)
         return true;
   return false;
}

void ResetOpen(PositionOpen &open, const long positionId)
{
   open.positionId = positionId;
   open.side = 0;
   open.volume = 0.0;
   open.value = 0.0;
   open.openTime = 0;
   open.sl = 0.0;
   open.tp = 0.0;
   open.commission = 0.0;
}

void AddOpen(PositionOpen &open, const int side, const double volume, const double price,
             const datetime time, const double commission, const double sl, const double tp)
{
   if(volume <= 0.0)
      return;

   if(open.volume <= 0.0)
   {
      open.side = side;
      open.openTime = time;
      open.volume = volume;
      open.value = price * volume;
      open.commission = commission;
      open.sl = sl;
      open.tp = tp;
      return;
   }

   if(time < open.openTime)
      open.openTime = time;

   open.volume += volume;
   open.value += price * volume;
   open.commission += commission;

   if(open.sl == 0.0 && sl != 0.0)
      open.sl = sl;
   if(open.tp == 0.0 && tp != 0.0)
      open.tp = tp;
}

void AppendClosed(ClosedDeal &list[], const ClosedDeal &item)
{
   int index = ArraySize(list);
   ArrayResize(list, index + 1);
   list[index] = item;
}

void AddClosed(ClosedDeal &list[], const long dealTicket, const long positionId,
               const string symbol, const int side, const double closeVolume,
               const double closePrice, const datetime closeTime,
               const double closeCommission, const double closeSwap, const double closeProfit,
               const PositionOpen &open, const double allocatedOpenCommission,
               const string reason, const string comment, const long magic)
{
   ClosedDeal item;
   item.dealId = dealTicket;
   item.positionId = positionId;
   item.symbol = symbol;
   item.side = side;
   item.volume = closeVolume;
   item.openTime = open.volume > 0.0 ? open.openTime : closeTime;
   item.closeTime = closeTime;
   item.openPrice = open.volume > 0.0 ? (open.value / open.volume) : closePrice;
   item.closePrice = closePrice;
   item.sl = open.sl;
   item.tp = open.tp;
   item.commission = closeCommission + allocatedOpenCommission;
   item.swap = closeSwap;
   item.profit = closeProfit;
   item.reason = reason;
   item.comment = comment;
   item.magic = magic;
   AppendClosed(list, item);
}

//+------------------------------------------------------------------+
//| Build the sync payload                                           |
//+------------------------------------------------------------------+
string AccountJson()
{
   string out = "{";
   StringAdd(out, "\"login\":" + JsonString(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))) + ",");
   StringAdd(out, "\"server\":" + JsonString(AccountInfoString(ACCOUNT_SERVER)) + ",");
   StringAdd(out, "\"name\":" + JsonString(AccountInfoString(ACCOUNT_NAME)) + ",");
   StringAdd(out, "\"company\":" + JsonString(AccountInfoString(ACCOUNT_COMPANY)) + ",");
   StringAdd(out, "\"currency\":" + JsonString(AccountInfoString(ACCOUNT_CURRENCY)) + ",");
   StringAdd(out, "\"balance\":" + JNum(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",");
   StringAdd(out, "\"equity\":" + JNum(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",");
   StringAdd(out, "\"margin\":" + JNum(AccountInfoDouble(ACCOUNT_MARGIN), 2) + ",");
   StringAdd(out, "\"freeMargin\":" + JNum(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",");
   StringAdd(out, "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + ",");
   StringAdd(out, "\"tradeAllowed\":" + JBool(AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) != 0) + ",");
   StringAdd(out, "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)));
   StringAdd(out, "}");
   return out;
}

string OpenPositionsJson()
{
   string out = "[";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      if(!PositionSelectByTicket(ticket))
         continue;

      long type = PositionGetInteger(POSITION_TYPE);
      int side = (type == POSITION_TYPE_BUY) ? 1 : -1;
      string symbol = PositionGetString(POSITION_SYMBOL);
      double volume = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double profit = PositionGetDouble(POSITION_PROFIT);
      double swap = PositionGetDouble(POSITION_SWAP);
      string comment = PositionGetString(POSITION_COMMENT);
      long magic = PositionGetInteger(POSITION_MAGIC);

      if(StringLen(out) > 1)
         StringAdd(out, ",");
      StringAdd(out, "{");
      StringAdd(out, "\"ticket\":" + JsonString(IntegerToString((long)ticket)) + ",");
      StringAdd(out, "\"symbol\":" + JsonString(symbol) + ",");
      StringAdd(out, "\"type\":" + JsonString(side == 1 ? "buy" : "sell") + ",");
      StringAdd(out, "\"volume\":" + JNum(volume, 2) + ",");
      StringAdd(out, "\"openTime\":" + JsonString(IsoTime(openTime)) + ",");
      StringAdd(out, "\"openPrice\":" + JNum(openPrice) + ",");
      StringAdd(out, "\"sl\":" + (sl > 0.0 ? JNum(sl) : "null") + ",");
      StringAdd(out, "\"tp\":" + (tp > 0.0 ? JNum(tp) : "null") + ",");
      StringAdd(out, "\"profit\":" + JNum(profit, 2) + ",");
      StringAdd(out, "\"swap\":" + JNum(swap, 2) + ",");
      StringAdd(out, "\"commission\":0,");
      StringAdd(out, "\"comment\":" + JsonString(comment) + ",");
      StringAdd(out, "\"magic\":" + IntegerToString(magic));
      StringAdd(out, "}");
   }
   StringAdd(out, "]");
   return out;
}

void ProcessPosition(const long positionId, const long &candidates[], ClosedDeal &closed[])
{
   if(!HistorySelectByPosition(positionId))
      return;

   PositionOpen open;
   ResetOpen(open, positionId);

   int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
   {
      long dealTicket = (long)HistoryDealGetTicket(i);
      if(dealTicket <= 0 || !IsTradeDeal(dealTicket))
         continue;

      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      int side = DealSide(dealTicket);
      double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double price = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      double commission = DealCommission(dealTicket);
      double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
      long magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
      string reason = ReasonText(HistoryDealGetInteger(dealTicket, DEAL_REASON));

      double orderSl = 0.0, orderTp = 0.0;
      ReadOrderSlTp(dealTicket, orderSl, orderTp);

      if(volume <= 0.0)
         continue;

      if(entry == DEAL_ENTRY_IN)
      {
         AddOpen(open, side, volume, price, dealTime, commission, orderSl, orderTp);
         continue;
      }

      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
      {
         double closeVolume = volume;
         double openCommission = 0.0;
         if(open.volume > 0.0)
         {
            if(closeVolume > open.volume)
               closeVolume = open.volume;
            openCommission = open.commission * (closeVolume / open.volume);
            if(IsCandidate(candidates, dealTicket))
            {
               AddClosed(closed, dealTicket, positionId, symbol, open.side, closeVolume,
                         price, dealTime, commission, swap, profit, open,
                         openCommission, reason, comment, magic);
            }
            double average = open.value / open.volume;
            open.volume -= closeVolume;
            open.value -= average * closeVolume;
            open.commission -= openCommission;
            if(open.volume <= 0.0000001)
               ResetOpen(open, positionId);
         }
         else
         {
            if(IsCandidate(candidates, dealTicket))
            {
               PositionOpen fallback;
               ResetOpen(fallback, positionId);
               AddClosed(closed, dealTicket, positionId, symbol, side == 1 ? -1 : 1, closeVolume,
                         price, dealTime, commission, swap, profit, fallback,
                         0.0, reason, comment, magic);
            }
         }
         continue;
      }

      if(entry == DEAL_ENTRY_INOUT)
      {
         if(open.volume > 0.0 && open.side != side)
         {
            double closeVolume = volume;
            if(closeVolume > open.volume)
               closeVolume = open.volume;
            double openCommission = open.commission * (closeVolume / open.volume);
            if(IsCandidate(candidates, dealTicket))
            {
               AddClosed(closed, dealTicket, positionId, symbol, open.side, closeVolume,
                         price, dealTime, commission, swap, profit, open,
                         openCommission, reason, comment, magic);
            }
            ResetOpen(open, positionId);
            AddOpen(open, side, volume, price, dealTime, 0.0, orderSl, orderTp);
         }
         else
         {
            AddOpen(open, side, volume, price, dealTime, commission, orderSl, orderTp);
         }
      }
   }
}

string ClosedTradesJson(const datetime from, const datetime to)
{
   HistorySelect(from, to);

   long candidates[];
   long positions[];
   int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
   {
      long dealTicket = (long)HistoryDealGetTicket(i);
      if(dealTicket <= 0 || !IsTradeDeal(dealTicket))
         continue;

      long entry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      if(!IsClosingEntry(entry))
         continue;

      long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
      int index = ArraySize(candidates);
      ArrayResize(candidates, index + 1);
      candidates[index] = dealTicket;

      if(!HasPosition(positions, positionId))
      {
         int pindex = ArraySize(positions);
         ArrayResize(positions, pindex + 1);
         positions[pindex] = positionId;
      }
   }

   ClosedDeal closed[];
   for(int i = 0; i < ArraySize(positions); i++)
      ProcessPosition(positions[i], candidates, closed);

   string out = "[";
   for(int i = 0; i < ArraySize(closed); i++)
   {
      ClosedDeal item = closed[i];
      if(StringLen(out) > 1)
         StringAdd(out, ",");
      StringAdd(out, "{");
      StringAdd(out, "\"dealId\":" + JsonString(IntegerToString(item.dealId)) + ",");
      StringAdd(out, "\"positionId\":" + JsonString(IntegerToString(item.positionId)) + ",");
      StringAdd(out, "\"symbol\":" + JsonString(item.symbol) + ",");
      StringAdd(out, "\"type\":" + JsonString(item.side == 1 ? "buy" : "sell") + ",");
      StringAdd(out, "\"volume\":" + JNum(item.volume, 2) + ",");
      StringAdd(out, "\"openTime\":" + JsonString(IsoTime(item.openTime)) + ",");
      StringAdd(out, "\"closeTime\":" + JsonString(IsoTime(item.closeTime)) + ",");
      StringAdd(out, "\"openPrice\":" + JNum(item.openPrice) + ",");
      StringAdd(out, "\"closePrice\":" + JNum(item.closePrice) + ",");
      StringAdd(out, "\"sl\":" + (item.sl > 0.0 ? JNum(item.sl) : "null") + ",");
      StringAdd(out, "\"tp\":" + (item.tp > 0.0 ? JNum(item.tp) : "null") + ",");
      StringAdd(out, "\"commission\":" + JNum(item.commission, 2) + ",");
      StringAdd(out, "\"swap\":" + JNum(item.swap, 2) + ",");
      StringAdd(out, "\"profit\":" + JNum(item.profit, 2) + ",");
      StringAdd(out, "\"closeReason\":" + JsonString(item.reason) + ",");
      StringAdd(out, "\"comment\":" + JsonString(item.comment) + ",");
      StringAdd(out, "\"magic\":" + IntegerToString(item.magic));
      StringAdd(out, "}");
   }
   StringAdd(out, "]");
   return out;
}

string BuildPayload(const datetime from, const datetime to)
{
   string out = "{";
   StringAdd(out, "\"version\":1,");
   StringAdd(out, "\"account\":" + AccountJson() + ",");
   StringAdd(out, "\"openPositions\":" + OpenPositionsJson() + ",");
   StringAdd(out, "\"closedTrades\":" + ClosedTradesJson(from, to) + ",");
   StringAdd(out, "\"sync\":{");
   StringAdd(out, "\"requestId\":" + JsonString(IntegerToString((long)TimeLocal()) + "-" + IntegerToString((long)GetTickCount())) + ",");
   StringAdd(out, "\"from\":" + JsonString(IsoTime(from)) + ",");
   StringAdd(out, "\"to\":" + JsonString(IsoTime(to)) + ",");
   StringAdd(out, "\"historyDays\":" + IntegerToString(InpHistoryDays));
   StringAdd(out, "}");
   StringAdd(out, "}");
   return out;
}

//+------------------------------------------------------------------+
//| HTTP                                                             |
//+------------------------------------------------------------------+
int PostJson(const string url, const string token, const string body, string &response)
{
   string headers = "Content-Type: application/json\r\n";
   headers += "Accept: application/json\r\n";
   headers += "Authorization: Bearer " + token;

   char data[];
   int length = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(length > 0 && data[length - 1] == 0)
      ArrayResize(data, length - 1);
   else
      ArrayResize(data, length);

   char result[];
   string resultHeaders = "";
   ResetLastError();
   int status = WebRequest("POST", url, headers, InpTimeoutMs, data, result, resultHeaders);
   if(status == -1)
   {
      PrintFormat("WebRequest failed (error %d). Add the journal server origin to Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL.",
                  GetLastError());
      response = "";
      return -1;
   }

   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   return status;
}

bool PerformSync(const bool forceFull, bool &requestedFull)
{
   requestedFull = false;
   if(StringLen(InpToken) == 0)
   {
      Print("InpToken is empty. Create a connection in the journal and paste its token here.");
      return false;
   }

   string server = NormalizeUrl(InpServerUrl);
   if(StringLen(server) == 0 || StringFind(server, "http") != 0)
   {
      Print("InpServerUrl must be the full journal URL, for example https://journal.example.com");
      return false;
   }

   if(AccountInfoInteger(ACCOUNT_LOGIN) <= 0 || StringLen(AccountInfoString(ACCOUNT_SERVER)) == 0)
   {
      Print("MT5 is not connected to a broker account yet. Log in and let the EA retry.");
      return false;
   }

   g_serverOffset = ServerOffsetSeconds();
   datetime syncStart = TimeCurrent();
   datetime from = 0;

   if(!forceFull && g_lastSyncMarker > 0)
   {
      long overlap = (long)InpOverlapHours * 3600;
      long start = (long)g_lastSyncMarker - overlap;
      if(start < 0)
         start = 0;
      from = (datetime)start;
   }
   else if(!forceFull && InpHistoryDays > 0)
   {
      long start = (long)syncStart - (long)InpHistoryDays * 86400;
      if(start < 0)
         start = 0;
      from = (datetime)start;
   }

   string body = BuildPayload(from, syncStart);
   if(InpLogDetails)
      PrintFormat("Sync payload: %d bytes, from %s", StringLen(body), TimeToString(from));

   string url = server + "/api/mt5/sync";
   string response = "";
   int status = -1;

   int retries = InpMaxRetries < 1 ? 1 : InpMaxRetries;
   for(int attempt = 1; attempt <= retries; attempt++)
   {
      status = PostJson(url, InpToken, body, response);
      if(status == 200)
         break;
      if(status == 400 || status == 401 || status == 403)
         break;
      if(attempt < InpMaxRetries)
      {
         PrintFormat("Sync attempt %d failed with HTTP %d. Retrying...", attempt, status);
         Sleep(2000 * attempt);
      }
   }

   if(status != 200)
   {
      PrintFormat("Sync failed with HTTP %d. %s", status, response);
      return false;
   }

   if(StringFind(response, "\"ok\":true") < 0)
   {
      Print("Sync was rejected: ", response);
      return false;
   }

   requestedFull = StringFind(response, "\"requestSync\":true") >= 0;
   g_lastSyncMarker = (datetime)(syncStart - 60);
   GlobalVariableSet(SyncMarkerKey(), (double)g_lastSyncMarker);

   if(InpLogDetails)
      Print("Sync ok: ", response);

   return true;
}

//+------------------------------------------------------------------+
//| Events                                                           |
//+------------------------------------------------------------------+
int OnInit()
{
   MathSrand((int)TimeLocal());
   g_serverOffset = ServerOffsetSeconds();

   string key = SyncMarkerKey();
   if(InpResetHistory && GlobalVariableCheck(key))
      GlobalVariableDel(key);

   g_lastSyncMarker = GlobalVariableCheck(key) ? (datetime)GlobalVariableGet(key) : 0;

   if(StringLen(InpToken) == 0)
      Print("TradingJournalSyncEA: add the connection token in InpToken.");

   int minutes = InpSyncMinutes < 1 ? 1 : InpSyncMinutes;
   PrintFormat("TradingJournalSyncEA started for %I64d on %s. Sync interval: %d minute(s). Last sync marker: %s",
               AccountInfoInteger(ACCOUNT_LOGIN),
               AccountInfoString(ACCOUNT_SERVER),
               minutes,
               g_lastSyncMarker > 0 ? TimeToString(g_lastSyncMarker) : "none (full history)");

   EventSetTimer(10);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   if(g_syncing)
      return;

   int minutes = InpSyncMinutes < 1 ? 1 : InpSyncMinutes;
   int interval = minutes * 60;
   if(g_lastAttempt > 0 && (TimeCurrent() - g_lastAttempt) < interval)
      return;

   g_lastAttempt = TimeCurrent();
   g_syncing = true;

   bool requestedFull = false;
   bool ok = PerformSync(false, requestedFull);

   if(ok && requestedFull)
   {
      Print("Journal requested a full sync. Sending full available history...");
      g_lastSyncMarker = 0;
      GlobalVariableDel(SyncMarkerKey());
      PerformSync(true, requestedFull);
   }

   g_syncing = false;
}

void OnTick()
{
   // This EA does not trade. It only syncs data on a timer.
}
//+------------------------------------------------------------------+
