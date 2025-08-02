import axios from 'axios';
import * as cheerio from 'cheerio';
import { verify } from './_verify';

export default async function handler(req, res) {
  const user = await verify(req, res);
  if (!user) return;
  const { carrier, trackingNo } = req.body;
  try {
    let result = { carrier, trackingNo, status: '取得失敗', time: '' };
    switch (carrier.toLowerCase()) {
      case 'sagawa': {
        const html = (await axios.get(`https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${trackingNo}`)).data;
        const $ = cheerio.load(html);
        const status = $('span.state').first().text().trim() || '未登録';
        let time = '';
        $('dl.okurijo_info dt').each((i, el) => {
          if ($(el).text().includes('配達完了日')) {
            time = $(el).next('dd').text().trim().replace(/年|月/g,'/').replace(/日/,'').replace('時',':').replace('分','');
            return false;
          }
        });
        result = { carrier, trackingNo, status, time };
        break;
      }
      case 'yamato': {
        const response = await axios.post(
          'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko',
          new URLSearchParams({ number01: trackingNo })
        );
        const $ = cheerio.load(response.data);
        const status = $('div.status_area .status').first().text().trim() || '未登録';
        const time = $('div.status_area .status_time').first().text().trim();
        result = { carrier, trackingNo, status, time };
        break;
      }
      case 'seino': {
        const html = (await axios.get(`https://track.seino.co.jp/track/?billno=${trackingNo}`)).data;
        const $ = cheerio.load(html);
        result = { carrier, trackingNo, status: $('td.status').first().text().trim() || '未登録', time: $('td.date').first().text().trim() };
        break;
      }
      case 'tonami': {
        const html = (await axios.get(`https://www.tonami.co.jp/tools/trade_track/?billno=${trackingNo}`)).data;
        const $ = cheerio.load(html);
        result = { carrier, trackingNo, status: $('span#status').first().text().trim() || '未登録', time: $('span#statusDate').first().text().trim() };
        break;
      }
      case 'fukuyama': {
        const html = (await axios.get(`https://webmy.fukuyama.co.jp/FY/FYTRK0100.aspx?strCTN=${trackingNo}`)).data;
        const $ = cheerio.load(html);
        result = { carrier, trackingNo, status: $('span#ctl00_ContentPlaceHolder1_lblState').first().text().trim() || '未登録', time: $('span#ctl00_ContentPlaceHolder1_lblDate').first().text().trim() };
        break;
      }
      case 'hida': {
        const html = (await axios.get(`https://www.hida-unyu.co.jp/WP_HIDAUNYU_WKSHO_GUEST/BILL_SEARCH/?bno=${trackingNo}`)).data;
        const $ = cheerio.load(html);
        result = { carrier, trackingNo, status: $('td.status').first().text().trim() || '未登録', time: $('td.date').first().text().trim() };
        break;
      }
      default:
        result = { carrier, trackingNo, status: '対応外', time: '' };
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.toString() });
  }
}
