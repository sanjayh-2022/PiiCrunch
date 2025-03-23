const express=require('express');
const app=express();
const session=require('express-session');
const path=require('path');
const cors=require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const port=3000;
const ejsmate=require("ejs-mate");
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const methodoverride=require('method-override');
app.set('view engine','ejs');
app.set('views',path.join(__dirname,"/views"));
app.use(express.static(path.join(__dirname,'/public')));
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.engine('ejs',ejsmate);
app.use(methodoverride("_method"));
const multer = require('multer');




//session options
sessionOptions={
    secret:"processenvSECRET",
    resave:false,
    saveUninitialized:true,
    cookie:{
      expires: Date.now() + 1*4*60*60*1000,
      maxAge:7*24*60*60*1000,
      httpOnly:true
    }
  };
  

  // Configure multer to store files in the 'uploads' directory
const upload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, '/tmp/'); // Specify the uploads directory
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname); // Use the original file name
    }
  })
});


//using sessions
app.use(session(sessionOptions))



//Listening
app.listen(port,()=>{
    console.log(`Listening on port ${port}`);
});

app.use((req, res, next) => {
  if (!req.session.originalfilename) {
    req.session.originalfilename = null; // or any default value, like 0
  }
  if (!req.session.data) {
    req.session.data = null; // or any default value
  }
  if (!req.session.redactedfilename) {
    req.session.redactedfilename = null; // or any default value
  }
  next();
});

app.get("/", (req, res) => {
  const originalfilename = req.session.originalfilename;
  const data = req.session.data;
  const redactedfilename = req.session.redactedfilename;
  res.render("listings/index.ejs", { originalfilename, data ,redactedfilename});
});




// After a successful file upload, update session variables
app.post('/uploadpdf', upload.single('uploadpdf'), async (req, res) => {
  try {
    const apiUrl = 'https://aswinr24-piicrunch-api.hf.space/pdf/detect';

    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    // Store the file path and original filename in the session
    req.session.originalfilename = req.file.originalname; // Store the original file name in session
    req.session.filepath = req.file.path; // Store the file path in session

    // Read the uploaded file from the file system using fs.createReadStream
    const fileStream = fs.createReadStream(req.file.path);

    // Create a FormData instance and append the file stream
    const formData = new FormData();
    formData.append('file', fileStream, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // Send the form-data request to the external API
    const response = await axios.post(apiUrl, formData, {
      headers: {
        ...formData.getHeaders(), // Get the proper headers for multipart form-data
      },
    });

    // Store the API response data in the session
    req.session.data = response.data;



    // Redirect to homepage (or render with updated data)
    res.redirect('/');
  } catch (error) {
    console.error('Error uploading PDF:', error);
    res.status(500).send('Error uploading PDF');
  }
});






app.post('/uploadimage', upload.single('uploadimage'), async (req, res) => {
  try {
    // API endpoint for PII detection
    const apiUrl = 'https://aswinr24-piicrunch-api.hf.space/image/detect';

    // Check if the file was uploaded
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    // Path to the saved file in the 'uploads' directory
    const filePath = req.file.path;;

    // Create a FormData instance and append the file
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // Send the form-data request to the external API for PII detection
    const response = await axios.post(apiUrl, formData, {
      headers: {
        ...formData.getHeaders(), // Ensure correct headers for 'multipart/form-data'
      },
    });

    // Store the PII data received from the external API in the session
    req.session.data = response.data; // Store PII data in session
    req.session.originalfilename = req.file.originalname; // Store original file name in session

    // Respond with the PII data (not an image)
    res.redirect('/');

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).send('Error uploading image or detecting PII');
  }
});





app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename); // Define the file path

  // Check if the file exists in the uploads directory
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found.');
  }

  // Check if the filename matches either the redacted or original file in the session
  if (filename === req.session.redactedfilename) {
    // Allow download and delete the file after download if it's the redacted file
    res.download(filePath, filename, (err) => {
        if (err) {
            console.error(`Error downloading file: ${filePath}`, err);
            return res.status(500).send('Error downloading file.');
        }

        // After the redacted file download is completed, delete the redacted file
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                console.error(`Error deleting redacted file: ${filePath}`, unlinkErr);
            } else {
                console.log(`Successfully deleted redacted file: ${filePath}`);

                // Now delete the original file as well
                const originalFilePath = path.join(__dirname, 'uploads', req.session.originalfilename);

                fs.unlink(originalFilePath, (unlinkOrigErr) => {
                    if (unlinkOrigErr) {
                        console.error(`Error deleting original file: ${originalFilePath}`, unlinkOrigErr);
                    } else {
                        console.log(`Successfully deleted original file: ${originalFilePath}`);

                        // Clear session data
                        req.session.redactedfilename = null;
                        req.session.originalfilename = null;
                        req.session.data = null;

                        // Explicitly save the session after clearing data
                        req.session.save((saveErr) => {
                            if (saveErr) {
                                console.error('Error saving session:', saveErr);
                                return res.status(500).send('Error saving session.');
                            }

                            console.log('Session cleared and saved.');
                        });
                    }
                });
            }
        });
    });
}
 else if (filename === req.session.originalfilename) {
    // Allow download only if it's the original file, without deleting it
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error(`Error downloading file: ${filePath}`, err);
        return res.status(500).send('Error downloading file.');
      }

      console.log(`File ${filename} downloaded without deletion.`);
    });

  } else {
    // If the filename doesn't match either redacted or original file, deny access
    return res.status(403).send('You are not authorized to download this file.');
  }
});




app.post('/redact-the-pdf', (req, res) => {
  const selectedPIIs = req.body.selectedPIIs;
  const originalFilename = req.session.originalfilename;
  const uploadsDir = path.join(__dirname, 'uploads'); // Assuming uploads directory exists

  console.log('Received pdf PIIs:', selectedPIIs);

  if (!selectedPIIs || !originalFilename) {
      console.log('No PIIs or original file received!');
      return res.status(400).send('No PIIs or file found.');
  } else {
      // Create form data to send to the external API
      const form = new FormData();
      
      // Append PII data
      form.append('pii_to_redact', selectedPIIs.join(','));  // Joining the array into a comma-separated string
      
      // Append the original file from the uploads directory
      const filePath = path.join(uploadsDir, originalFilename);
      form.append('file', fs.createReadStream(filePath));

      // Send POST request to the redaction API
      axios.post('https://aswinr24-piicrunch-api.hf.space/pdf/redact', form, {
          headers: {
              ...form.getHeaders()
          },
          responseType: 'stream' // To handle the file stream response
      })
      .then(response => {
          const redactedFilename = `r_${originalFilename}`;
          const redactedFilePath = path.join(uploadsDir, redactedFilename);

          // Write the stream to a file
          const writer = fs.createWriteStream(redactedFilePath);
          response.data.pipe(writer);

          writer.on('finish', () => {
              // Update session with redacted filename
              req.session.redactedfilename = redactedFilename;
              console.log('File redacted and saved as:', redactedFilename);

              // Redirect or send response back to client
              res.redirect('/');
          });

          writer.on('error', (err) => {
              console.error('Error writing redacted file:', err);
              res.status(500).send('Error saving redacted file.');
          });
      })
      .catch(err => {
          console.error('Error sending POST request:', err);
          res.status(500).send('Error processing the redaction.');
      });
  }
});


app.post('/redact-the-img', (req, res) => {

  const selectedPIIs = req.body.selectedPIIs;
  const originalFilename = req.session.originalfilename;
  const uploadsDir = path.join(__dirname, 'uploads'); // Assuming uploads directory exists

  console.log('Received pdf PIIs:', selectedPIIs);

  if (!selectedPIIs || !originalFilename) {
      console.log('No PIIs or original file received!');
      return res.status(400).send('No PIIs or file found.');
  } else {
      // Create form data to send to the external API
      const form = new FormData();
      
      // Append PII data
      form.append('pii_to_redact', selectedPIIs.join(','));  // Joining the array into a comma-separated string
      
      // Append the original file from the uploads directory
      const filePath = path.join(uploadsDir, originalFilename);
      form.append('file', fs.createReadStream(filePath));

      // Send POST request to the redaction API
      axios.post('https://aswinr24-piicrunch-api.hf.space/image/redact', form, {
          headers: {
              ...form.getHeaders()
          },
          responseType: 'stream' // To handle the file stream response
      })
      .then(response => {
          const redactedFilename = `r_${originalFilename}`;
          const redactedFilePath = path.join(uploadsDir, redactedFilename);

          // Write the stream to a file
          const writer = fs.createWriteStream(redactedFilePath);
          response.data.pipe(writer);

          writer.on('finish', () => {
              // Update session with redacted filename
              req.session.redactedfilename = redactedFilename;
              console.log('File redacted and saved as:', redactedFilename);

              // Redirect or send response back to client
              res.redirect('/');
          });

          writer.on('error', (err) => {
              console.error('Error writing redacted file:', err);
              res.status(500).send('Error saving redacted file.');
          });
      })
      .catch(err => {
          console.error('Error sending POST request:', err);
          res.status(500).send('Error processing the redaction.');
      });
  }

});



app.post('/redact-the-doc', (req, res) => {

  const selectedPIIs = req.body.selectedPIIs;
  console.log('Received document PIIs:', selectedPIIs);

  if (!selectedPIIs) {
    console.log('No PIIs received!');
  }

  // Now you can process the selected PII data and perform the redaction or any other operations
  res.redirect('/');

});
