package main

import (
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/contrib/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Field struct {
	ID          string   `json:"id" bson:"id"`
	Type        string   `json:"type" bson:"type"` // text|textarea|mcq|checkbox|rating
	Label       string   `json:"label" bson:"label"`
	Required    bool     `json:"required" bson:"required"`
	Options     []string `json:"options,omitempty" bson:"options,omitempty"`
	Min         *int     `json:"min,omitempty" bson:"min,omitempty"`
	Max         *int     `json:"max,omitempty" bson:"max,omitempty"`
	Placeholder string   `json:"placeholder,omitempty" bson:"placeholder,omitempty"`
	VisibleIf   *struct {
		FieldID  string      `json:"fieldId" bson:"fieldId"`
		Operator string      `json:"operator" bson:"operator"`
		Value    interface{} `json:"value" bson:"value"`
	} `json:"visibleIf,omitempty" bson:"visibleIf,omitempty"`
}

type Form struct {
	ID          primitive.ObjectID `json:"_id" bson:"_id,omitempty"`
	OwnerID     string             `json:"ownerId,omitempty" bson:"ownerId,omitempty"`
	Title       string             `json:"title" bson:"title"`
	Description string             `json:"description" bson:"description"`
	Status      string             `json:"status" bson:"status"` // draft|published
	CreatedAt   time.Time          `json:"createdAt" bson:"createdAt"`
	UpdatedAt   time.Time          `json:"updatedAt" bson:"updatedAt"`
	Fields      []Field            `json:"fields" bson:"fields"`
}

type Answer struct {
	FieldID string      `json:"fieldId" bson:"fieldId"`
	Value   interface{} `json:"value" bson:"value"`
}

type Response struct {
	ID          primitive.ObjectID `json:"_id" bson:"_id,omitempty"`
	FormID      primitive.ObjectID `json:"formId" bson:"formId"`
	SubmittedAt time.Time          `json:"submittedAt" bson:"submittedAt"`
	Answers     []Answer           `json:"answers" bson:"answers"`
	Meta        map[string]string  `json:"meta,omitempty" bson:"meta,omitempty"`
}

var mongoClient *mongo.Client
var db *mongo.Database
var formsCol *mongo.Collection
var respCol *mongo.Collection

// simple hub for ws
type hubMap struct {
	mu   sync.RWMutex
	data map[string]map[*websocket.Conn]bool
}

var hubs = hubMap{data: map[string]map[*websocket.Conn]bool{}}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	ctx := context.Background()
	var err error

	mongoURI := getEnv("MONGO_URI", "mongodb://localhost:27017")
	mongoDB := getEnv("MONGO_DB", "formbuilder")
	apiPort := getEnv("API_PORT", "8080")
	corsOrigin := getEnv("CORS_ORIGIN", "*")

	mongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatal(err)
	}
	db = mongoClient.Database(mongoDB)
	formsCol = db.Collection("forms")
	respCol = db.Collection("responses")

	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins: corsOrigin,
		AllowHeaders: "*",
		AllowMethods: "GET,POST,PUT,OPTIONS",
	}))

	app.Get("/api/health", func(c *fiber.Ctx) error { return c.SendString("ok") })

	app.Post("/api/forms", createForm)
	app.Get("/api/forms/:id", getForm)
	app.Put("/api/forms/:id", updateForm)
	app.Post("/api/forms/:id/publish", publishForm)

	app.Post("/api/responses", submitResponse)
	app.Get("/api/analytics/:formId/summary", analyticsSummary)
	app.Get("/api/forms/:id/export", exportCSV)

	app.Get("/ws", websocket.New(wsHandler))

	log.Printf("API listening on :%s", apiPort)
	if err := app.Listen(":" + apiPort); err != nil {
		log.Fatal(err)
	}
}

func createForm(c *fiber.Ctx) error {
	var f Form
	if err := c.BodyParser(&f); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if f.Title == "" {
		f.Title = "Untitled Form"
	}
	f.Status = "draft"
	f.CreatedAt = time.Now()
	f.UpdatedAt = f.CreatedAt
	res, err := formsCol.InsertOne(c.Context(), f)
	if err != nil {
		return fiber.ErrInternalServerError
	}
	f.ID = res.InsertedID.(primitive.ObjectID)
	return c.Status(fiber.StatusCreated).JSON(f)
}

func getForm(c *fiber.Ctx) error {
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "bad id")
	}
	var f Form
	if err := formsCol.FindOne(c.Context(), bson.M{"_id": id}).Decode(&f); err != nil {
		return fiber.ErrNotFound
	}
	return c.JSON(f)
}

func updateForm(c *fiber.Ctx) error {
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "bad id")
	}
	var patch Form
	if err := c.BodyParser(&patch); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	patch.UpdatedAt = time.Now()
	_, err = formsCol.UpdateByID(c.Context(), id, bson.M{"$set": bson.M{
		"title":       patch.Title,
		"description": patch.Description,
		"fields":      patch.Fields,
		"updatedAt":   patch.UpdatedAt,
	}})
	if err != nil {
		return fiber.ErrInternalServerError
	}
	return getForm(c)
}

func publishForm(c *fiber.Ctx) error {
	id, err := primitive.ObjectIDFromHex(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "bad id")
	}
	_, err = formsCol.UpdateByID(c.Context(), id, bson.M{"$set": bson.M{
		"status":    "published",
		"updatedAt": time.Now(),
	}})
	if err != nil {
		return fiber.ErrInternalServerError
	}
	return getForm(c)
}

func submitResponse(c *fiber.Ctx) error {
	var input struct {
		FormID  string   `json:"formId"`
		Answers []Answer `json:"answers"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	fid, err := primitive.ObjectIDFromHex(input.FormID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "bad formId")
	}

	var f Form
	if err := formsCol.FindOne(c.Context(), bson.M{"_id": fid, "status": "published"}).Decode(&f); err != nil {
		return fiber.NewError(fiber.StatusNotFound, "form not found or not published")
	}

	if err := validateAnswers(f.Fields, input.Answers); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	meta := map[string]string{
		"ip": clientIP(c),
		"ua": string(c.Request().Header.UserAgent()),
	}

	doc := Response{
		FormID:      fid,
		SubmittedAt: time.Now(),
		Answers:     input.Answers,
		Meta:        meta,
	}
	_, err = respCol.InsertOne(c.Context(), doc)
	if err != nil {
		return fiber.ErrInternalServerError
	}

	// broadcast to dashboards
	payload := fiber.Map{
		"type":   "response:created",
		"formId": fid.Hex(),
		"payload": fiber.Map{
			"answers":     input.Answers,
			"submittedAt": doc.SubmittedAt,
		},
	}
	broadcast(fid.Hex(), payload)

	return c.SendStatus(fiber.StatusCreated)
}

func clientIP(c *fiber.Ctx) string {
	ip := c.IP()
	if parsed := net.ParseIP(ip); parsed != nil {
		return parsed.String()
	}
	return ip
}

func analyticsSummary(c *fiber.Ctx) error {
	formId := c.Params("formId")
	fid, err := primitive.ObjectIDFromHex(formId)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "bad formId")
	}

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"formId": fid}}},
		{{Key: "$unwind", Value: "$answers"}},
		{{Key: "$group", Value: bson.M{
			"_id":   bson.M{"fieldId": "$answers.fieldId", "value": "$answers.value"},
			"count": bson.M{"$sum": 1},
		}}},
	}

	cur, err := respCol.Aggregate(c.Context(), pipeline)
	if err != nil {
		return fiber.ErrInternalServerError
	}
	defer cur.Close(c.Context())

	type bucket struct {
		ID struct {
			FieldID string      `bson:"fieldId" json:"fieldId"`
			Value   interface{} `bson:"value" json:"value"`
		} `bson:"_id" json:"_id"`
		Count int `bson:"count" json:"count"`
	}

	var rows []bucket
	if err := cur.All(c.Context(), &rows); err != nil {
		return fiber.ErrInternalServerError
	}

	// reshape into { fieldId: { value: count } }
	out := map[string]map[string]int{}
	for _, r := range rows {
		fid := r.ID.FieldID
		val := toKey(r.ID.Value)
		if _, ok := out[fid]; !ok {
			out[fid] = map[string]int{}
		}
		out[fid][val] = r.Count
	}

	return c.JSON(fiber.Map{
		"buckets": out,
	})
}

func exportCSV(c *fiber.Ctx) error {
	idHex := c.Params("id")
	fid, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "bad id")
	}
	cur, err := respCol.Find(c.Context(), bson.M{"formId": fid})
	if err != nil {
		return fiber.ErrInternalServerError
	}
	defer cur.Close(c.Context())

	c.Set("Content-Type", "text/csv")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="form_%s_responses.csv"`, idHex))

	w := csv.NewWriter(c)
	defer w.Flush()

	// header (generic)
	_ = w.Write([]string{"submittedAt", "fieldId", "value"})

	for cur.Next(c.Context()) {
		var r Response
		if err := cur.Decode(&r); err != nil {
			continue
		}
		for _, a := range r.Answers {
			_ = w.Write([]string{r.SubmittedAt.Format(time.RFC3339), a.FieldID, toKey(a.Value)})
		}
	}

	return nil
}

func toKey(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		// JSON numbers decode as float64
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int32, int64, int:
		return fmt.Sprint(t)
	case []interface{}:
		parts := []string{}
		for _, it := range t {
			parts = append(parts, toKey(it))
		}
		return strings.Join(parts, "|")
	default:
		b, _ := bson.MarshalExtJSON(v, false, false)
		return string(b)
	}
}

func wsHandler(conn *websocket.Conn) {
	formId := conn.Query("formId")
	if formId == "" {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"missing formId"}`))
		_ = conn.Close()
		return
	}
	hubs.mu.Lock()
	if _, ok := hubs.data[formId]; !ok {
		hubs.data[formId] = map[*websocket.Conn]bool{}
	}
	hubs.data[formId][conn] = true
	hubs.mu.Unlock()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
	hubs.mu.Lock()
	delete(hubs.data[formId], conn)
	hubs.mu.Unlock()
	_ = conn.Close()
}

func broadcast(formId string, payload interface{}) {
	hubs.mu.RLock()
	conns := hubs.data[formId]
	hubs.mu.RUnlock()
	for c := range conns {
		_ = c.WriteJSON(payload)
	}
}

func validateAnswers(fields []Field, answers []Answer) error {
	// build lookups
	fieldMap := map[string]Field{}
	for _, f := range fields {
		fieldMap[f.ID] = f
	}

	// required check
	for _, f := range fields {
		if f.Required {
			found := false
			for _, a := range answers {
				if a.FieldID == f.ID {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("missing required field: %s", f.ID)
			}
		}
	}

	// type checks
	for _, a := range answers {
		f, ok := fieldMap[a.FieldID]
		if !ok {
			return fmt.Errorf("unknown field: %s", a.FieldID)
		}
		switch f.Type {
		case "text", "textarea":
			if _, ok := a.Value.(string); !ok {
				return fmt.Errorf("field %s expects string", f.ID)
			}
		case "mcq":
			// must be a string among options
			s, ok := a.Value.(string)
			if !ok {
				return fmt.Errorf("field %s expects string", f.ID)
			}
			if len(f.Options) > 0 {
				valid := false
				for _, opt := range f.Options {
					if opt == s {
						valid = true
						break
					}
				}
				if !valid {
					return fmt.Errorf("field %s invalid option", f.ID)
				}
			}
		case "checkbox":
			// array of strings subset of options
			arr, ok := a.Value.([]interface{})
			if !ok {
				return fmt.Errorf("field %s expects array", f.ID)
			}
			optSet := map[string]bool{}
			for _, o := range f.Options {
				optSet[o] = true
			}
			for _, it := range arr {
				s, ok := it.(string)
				if !ok || !optSet[s] {
					return fmt.Errorf("field %s invalid checkbox value", f.ID)
				}
			}
		case "rating":
			// number between min/max
			num, ok := a.Value.(float64)
			if !ok {
				return fmt.Errorf("field %s expects number", f.ID)
			}
			min := 1
			max := 5
			if f.Min != nil {
				min = *f.Min
			}
			if f.Max != nil {
				max = *f.Max
			}
			if int(num) < min || int(num) > max {
				return fmt.Errorf("field %s out of range", f.ID)
			}
		default:
			return fmt.Errorf("unsupported field type %s", f.Type)
		}
	}
	return nil
}