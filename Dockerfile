# mario-music in un container.
#
# IL SERVER NON HA DIPENDENZE: usa node:http e node:sqlite, che stanno dentro
# Node, e Node 25 esegue i .ts togliendo i tipi al volo. Quindi nell'immagine
# finale non c'è nessun node_modules — solo i sorgenti del server e ffmpeg.
# È il motivo per cui questa immagine pesa poco ed è rapidissima da costruire.

FROM node:25-alpine
# ffmpeg e ffprobe servono a leggere i tag, estrarre le copertine e
# convertire in AAC: senza, l'indicizzazione non parte nemmeno.
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY scripts ./scripts

# I due percorsi che si montano da fuori. Dentro all'immagine non c'è niente
# di tuo: la musica e i dati vivono nei volumi, così ricostruire l'immagine
# non tocca playlist, preferiti e ascolti.
ENV MUSIC_DIR=/music \
    DATA_DIR=/data \
    PORT=4000
VOLUME ["/music", "/data"]
EXPOSE 4000

# Non si gira da root: se qualcuno trovasse un buco nel server, si ritroverebbe
# con i permessi di un utente che non può fare niente. L'utente `node` esiste
# già nell'immagine ufficiale.
RUN mkdir -p /music /data && chown -R node:node /data /music
USER node

# Il controllo di salute interroga l'API: un processo vivo che non risponde
# più alle richieste è comunque un servizio rotto, e così Docker se ne accorge.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Nessuno scan all'avvio: con una libreria grande ritarderebbe la partenza di
# minuti. Il server fa il suo primo ripasso da solo, ed è sempre raggiungibile.
CMD ["node", "server/index.ts"]
