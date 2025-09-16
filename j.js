process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

const fs = require('fs');
const TronWeb = require('tronweb').default || require('tronweb');

let privateKey;
try {
  privateKey = fs.readFileSync('./pk.txt', 'utf8').trim();
  if (!privateKey) throw new Error('File pk.txt kosong!');
} catch (err) {
  console.error('Gagal baca file pk.txt:', err.message);
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  privateKey: privateKey,
  timeout: 15000,
});

const toAddress = 'TQPS944dQDii6Cqwm2m5Xwj6JzGxR6hVqD';
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

let totalUSDTSent = 0;

async function getBalances() {
  try {
    await tronWeb.fullNode.request('wallet/getnowblock');

    const fromAddress = tronWeb.defaultAddress.base58;
    const balanceSun = await tronWeb.trx.getBalance(fromAddress);
    const balanceTRX = balanceSun / 1e6;

    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    const usdtBalanceRaw = await contract.methods.balanceOf(fromAddress).call();
    const balanceUSDT = usdtBalanceRaw / 1e6;

    console.log(`[${new Date().toLocaleString()}] Saldo wallet:\nTRX: ${balanceTRX} \nUSDT: ${balanceUSDT}`);
    return { balanceTRX, balanceUSDT };
  } catch (err) {
    console.error('Error saat cek saldo:', err.stack || err);
    return { balanceTRX: 0, balanceUSDT: 0 };
  }
}

async function waitForConfirmation(txid, timeout = 120000, interval = 3000) {
  const start = Date.now();
  while (true) {
    try {
      const receipt = await tronWeb.trx.getTransactionInfo(txid);
      if (receipt && receipt.receipt && receipt.receipt.result === 'SUCCESS') {
        console.log('Transaksi terkonfirmasi di blockchain:', txid);
        return true;
      } else if (receipt && receipt.receipt && receipt.receipt.result === 'FAILED') {
        console.error('Transaksi gagal di blockchain:', txid);
        return false;
      }
    } catch (err) {
      // retry saat belum ditemukan
    }
    if (Date.now() - start > timeout) {
      console.error('Timeout menunggu konfirmasi transaksi:', txid);
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

async function sendUSDT(amount) {
  try {
    if (amount <= 0) {
      console.log('Tidak ada USDT untuk dikirim');
      return;
    }

    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);

    console.log(`Mengirim ${amount} USDT ke ${toAddress}...`);

    const txid = await contract.methods.transfer(toAddress, amount * 1e6).send({
      feeLimit: 10000000,
      callValue: 0,
      shouldPollResponse: false,
    });

    console.log('Transaksi broadcast, TxID:', txid);

    const confirmation = await waitForConfirmation(txid);
    if (confirmation) {
      totalUSDTSent += amount;
      console.log(`Total USDT terkirim sampai saat ini: ${totalUSDTSent}`);
    } else {
      console.error('Transaksi tidak terkonfirmasi.');
    }

  } catch (error) {
    console.error('Gagal kirim USDT:', error.stack || error);
  }
}

async function mainLoop() {
  while (true) {
    try {
      const { balanceTRX, balanceUSDT } = await getBalances();

      if (balanceUSDT > 0) {
        await sendUSDT(balanceUSDT);
      } else {
        console.log('Saldo USDT kosong, tidak mengirim.');
      }
    } catch (err) {
      console.error('Error di loop utama:', err.stack || err);
    }
    // Delay 10 detik antar iterasi untuk menghindari rate limit
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

mainLoop();
bb3f3cdf69cccd9b93c64d60b7475af111b308b80abedf0a732179bc91645f94
